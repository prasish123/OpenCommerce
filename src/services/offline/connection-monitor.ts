/**
 * Connection Monitor
 * Detect online/offline status and trigger sync accordingly
 */

import { syncService } from './sync-service';
import { log } from '../../shared/logger';
import { eventBus } from '../../shared/events';

export enum ConnectionStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  UNSTABLE = 'UNSTABLE',
}

export class ConnectionMonitor {
  private status: ConnectionStatus = ConnectionStatus.ONLINE;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL = 5000; // Check every 5 seconds
  private readonly PING_TIMEOUT = 3000; // 3 second timeout
  private serverUrl: string;
  private storeId: string = '';
  private terminalId: string = '';
  private consecutiveFailures: number = 0;
  private readonly FAILURE_THRESHOLD = 3; // 3 failures = offline

  constructor(serverUrl: string = process.env.API_URL || 'http://localhost:3000') {
    this.serverUrl = serverUrl;
    this.setupBrowserListeners();
  }

  /**
   * Setup browser online/offline event listeners
   */
  private setupBrowserListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        log.info('Browser detected: ONLINE');
        this.handleOnline();
      });

      window.addEventListener('offline', () => {
        log.warn('Browser detected: OFFLINE');
        this.handleOffline();
      });
    }
  }

  /**
   * Start monitoring connection
   */
  start(storeId: string, terminalId: string): void {
    this.storeId = storeId;
    this.terminalId = terminalId;

    log.info('Connection monitor started', { storeId, terminalId });

    // Initial check
    this.checkConnection();

    // Start periodic checks
    this.checkInterval = setInterval(() => {
      this.checkConnection();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      log.info('Connection monitor stopped');
    }
  }

  /**
   * Check connection by pinging server
   */
  private async checkConnection(): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.PING_TIMEOUT);

      const response = await fetch(`${this.serverUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        // Server is reachable
        this.consecutiveFailures = 0;

        if (this.status !== ConnectionStatus.ONLINE) {
          this.handleOnline();
        }
      } else {
        // Server returned error
        this.handleConnectionIssue();
      }
    } catch (error) {
      // Network error or timeout
      this.handleConnectionIssue();
    }
  }

  /**
   * Handle connection issue
   */
  private handleConnectionIssue(): void {
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      if (this.status !== ConnectionStatus.OFFLINE) {
        this.handleOffline();
      }
    } else if (this.status === ConnectionStatus.ONLINE) {
      // First failure - mark as unstable
      this.setStatus(ConnectionStatus.UNSTABLE);
    }
  }

  /**
   * Handle transition to online
   */
  private handleOnline(): void {
    const wasOffline = this.status === ConnectionStatus.OFFLINE;

    this.setStatus(ConnectionStatus.ONLINE);
    this.consecutiveFailures = 0;

    if (wasOffline && this.storeId && this.terminalId) {
      // Trigger immediate sync after coming back online
      log.info('Connection restored - triggering sync');
      syncService.forceSyncNow(this.storeId, this.terminalId).catch((error) => {
        log.error('Failed to sync after reconnection', { error: error.message });
      });
    }
  }

  /**
   * Handle transition to offline
   */
  private handleOffline(): void {
    this.setStatus(ConnectionStatus.OFFLINE);
  }

  /**
   * Set connection status and emit event
   */
  private setStatus(newStatus: ConnectionStatus): void {
    if (this.status !== newStatus) {
      const oldStatus = this.status;
      this.status = newStatus;

      log.info('Connection status changed', {
        from: oldStatus,
        to: newStatus,
        consecutiveFailures: this.consecutiveFailures,
      });

      // Emit event
      eventBus.emit('connection.status.changed', {
        oldStatus,
        newStatus,
        timestamp: new Date().toISOString(),
      });

      // Show user notification if in browser
      this.showUserNotification(newStatus);
    }
  }

  /**
   * Show user notification (browser toast)
   */
  private showUserNotification(status: ConnectionStatus): void {
    if (typeof window === 'undefined') return;

    const event = new CustomEvent('connection-status-changed', {
      detail: {
        status,
        message: this.getStatusMessage(status),
      },
    });

    window.dispatchEvent(event);
  }

  /**
   * Get user-friendly status message
   */
  private getStatusMessage(status: ConnectionStatus): string {
    switch (status) {
      case ConnectionStatus.ONLINE:
        return '✅ Connection restored - syncing data...';
      case ConnectionStatus.OFFLINE:
        return '❌ Working offline - transactions will sync when connection is restored';
      case ConnectionStatus.UNSTABLE:
        return '⚠️ Connection unstable - attempting to reconnect...';
    }
  }

  /**
   * Get current status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    return this.status === ConnectionStatus.ONLINE;
  }

  /**
   * Check if currently offline
   */
  isOffline(): boolean {
    return this.status === ConnectionStatus.OFFLINE;
  }

  /**
   * Get connection stats
   */
  getStats(): any {
    return {
      status: this.status,
      consecutiveFailures: this.consecutiveFailures,
      isMonitoring: this.checkInterval !== null,
    };
  }
}

// Singleton instance
export const connectionMonitor = new ConnectionMonitor();
