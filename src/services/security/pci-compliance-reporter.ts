import { db } from '../../shared/database';
import { log } from '../../shared/logger';
import { auditLogger } from './audit-logger';

/**
 * PCI Compliance Reporter
 * Generate reports for PCI DSS compliance audits
 */

export interface PCIComplianceReport {
  reportDate: Date;
  reportingPeriod: {
    start: Date;
    end: Date;
  };
  summary: {
    totalTransactions: number;
    totalAuditEvents: number;
    securityViolations: number;
    failedLogins: number;
    accountLockouts: number;
    activeEncryptionKeys: number;
  };
  requirements: Array<{
    requirement: string;
    description: string;
    status: string;
    evidence?: string;
    lastVerified?: Date;
  }>;
  recommendations: string[];
}

export class PCIComplianceReporter {
  /**
   * Generate comprehensive PCI compliance report
   */
  async generateReport(startDate: Date, endDate: Date): Promise<PCIComplianceReport> {
    log.info('Generating PCI compliance report', { startDate, endDate });

    const summary = await this.generateSummary(startDate, endDate);
    const requirements = await this.getComplianceRequirements();
    const recommendations = await this.generateRecommendations(summary);

    return {
      reportDate: new Date(),
      reportingPeriod: {
        start: startDate,
        end: endDate,
      },
      summary,
      requirements,
      recommendations,
    };
  }

  /**
   * Generate summary statistics
   */
  private async generateSummary(startDate: Date, endDate: Date): Promise<any> {
    // Total transactions
    const transactionsResult = await db.query(
      `SELECT COUNT(*) as count
       FROM order_service.retail_transactions
       WHERE created_at >= $1 AND created_at <= $2`,
      [startDate, endDate]
    );

    // Audit events
    const auditReport = await auditLogger.generateComplianceReport(startDate, endDate);

    // Account lockouts
    const lockoutsResult = await db.query(
      `SELECT COUNT(*) as count
       FROM compliance_service.account_lockouts
       WHERE locked_at >= $1 AND locked_at <= $2`,
      [startDate, endDate]
    );

    // Active encryption keys
    const keysResult = await db.query(
      `SELECT COUNT(*) as count
       FROM compliance_service.encryption_keys
       WHERE is_active = true`
    );

    return {
      totalTransactions: parseInt(transactionsResult.rows[0].count),
      totalAuditEvents: auditReport.totalEvents,
      securityViolations: auditReport.securityViolations,
      failedLogins: auditReport.failedLogins,
      accountLockouts: parseInt(lockoutsResult.rows[0].count),
      activeEncryptionKeys: parseInt(keysResult.rows[0].count),
    };
  }

  /**
   * Get compliance requirements status
   */
  private async getComplianceRequirements(): Promise<any[]> {
    const result = await db.query(
      `SELECT
        requirement, description, status, evidence,
        last_verified as "lastVerified"
       FROM compliance_service.pci_compliance_checklist
       ORDER BY requirement`
    );

    return result.rows;
  }

  /**
   * Generate recommendations based on findings
   */
  private async generateRecommendations(summary: any): Promise<string[]> {
    const recommendations: string[] = [];

    if (summary.securityViolations > 0) {
      recommendations.push(
        `Review and address ${summary.securityViolations} security violations`
      );
    }

    if (summary.failedLogins > 100) {
      recommendations.push(
        'High number of failed login attempts detected - consider implementing rate limiting'
      );
    }

    if (summary.accountLockouts > 10) {
      recommendations.push(
        'Multiple account lockouts detected - review user training on password policies'
      );
    }

    // Check for encryption key rotation
    const oldKeysResult = await db.query(
      `SELECT COUNT(*) as count
       FROM compliance_service.encryption_keys
       WHERE is_active = true
         AND created_at < NOW() - INTERVAL '1 year'`
    );

    if (parseInt(oldKeysResult.rows[0].count) > 0) {
      recommendations.push(
        'Some encryption keys have not been rotated in over 1 year - schedule key rotation'
      );
    }

    // Check for expired payment tokens
    const expiredTokensResult = await db.query(
      `SELECT COUNT(*) as count
       FROM compliance_service.payment_tokens
       WHERE expires_at < NOW()`
    );

    if (parseInt(expiredTokensResult.rows[0].count) > 0) {
      recommendations.push(
        `Clean up ${expiredTokensResult.rows[0].count} expired payment tokens`
      );
    }

    return recommendations;
  }

  /**
   * Update compliance requirement status
   */
  async updateRequirement(
    requirement: string,
    status: 'COMPLIANT' | 'NON_COMPLIANT' | 'IN_PROGRESS' | 'NOT_APPLICABLE',
    evidence?: string,
    verifiedBy?: string
  ): Promise<void> {
    await db.query(
      `UPDATE compliance_service.pci_compliance_checklist
       SET status = $1,
           evidence = $2,
           last_verified = NOW(),
           verified_by = $3,
           updated_at = NOW()
       WHERE requirement = $4`,
      [status, evidence || null, verifiedBy || null, requirement]
    );

    log.info('Compliance requirement updated', {
      requirement,
      status,
      verifiedBy,
    });
  }

  /**
   * Export report as JSON
   */
  async exportReportJSON(startDate: Date, endDate: Date): Promise<string> {
    const report = await this.generateReport(startDate, endDate);
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export report as CSV (for auditors)
   */
  async exportReportCSV(startDate: Date, endDate: Date): Promise<string> {
    const report = await this.generateReport(startDate, endDate);

    const lines: string[] = [
      '# PCI DSS Compliance Report',
      `# Generated: ${report.reportDate.toISOString()}`,
      `# Period: ${report.reportingPeriod.start.toISOString()} to ${report.reportingPeriod.end.toISOString()}`,
      '',
      '## Summary Statistics',
      `Total Transactions,${report.summary.totalTransactions}`,
      `Total Audit Events,${report.summary.totalAuditEvents}`,
      `Security Violations,${report.summary.securityViolations}`,
      `Failed Logins,${report.summary.failedLogins}`,
      `Account Lockouts,${report.summary.accountLockouts}`,
      `Active Encryption Keys,${report.summary.activeEncryptionKeys}`,
      '',
      '## Compliance Requirements',
      'Requirement,Description,Status,Last Verified',
    ];

    for (const req of report.requirements) {
      lines.push(
        `${req.requirement},"${req.description}",${req.status},${
          req.lastVerified || 'N/A'
        }`
      );
    }

    if (report.recommendations.length > 0) {
      lines.push('');
      lines.push('## Recommendations');
      for (const rec of report.recommendations) {
        lines.push(`- ${rec}`);
      }
    }

    return lines.join('\n');
  }
}

// Singleton instance
export const pciReporter = new PCIComplianceReporter();
