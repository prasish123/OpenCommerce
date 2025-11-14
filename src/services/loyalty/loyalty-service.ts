import { db } from '../../shared/database';
import { log } from '../../shared/logger';
import { eventBus } from '../../shared/event-bus';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';

/**
 * Loyalty Service
 * Handles member lookup, points tracking, rewards redemption
 */

export interface LoyaltyMember {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  pointsBalance: number;
  lifetimePoints: number;
  tier: LoyaltyTier;
  joinedDate: Date;
  lastVisit?: Date;
  isActive: boolean;
}

export enum LoyaltyTier {
  BRONZE = 'BRONZE',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
}

export interface LoyaltyReward {
  id: string;
  rewardName: string;
  description: string;
  pointsCost: number;
  rewardType: RewardType;
  rewardValue: number;
  isActive: boolean;
}

export enum RewardType {
  DOLLAR_OFF = 'DOLLAR_OFF',
  PERCENT_OFF = 'PERCENT_OFF',
  FREE_PRODUCT = 'FREE_PRODUCT',
  BONUS_POINTS = 'BONUS_POINTS',
}

export interface PointsTransaction {
  id: string;
  memberId: string;
  transactionType: PointsTransactionType;
  points: number;
  orderId?: string;
  rewardId?: string;
  expiresAt?: Date;
  createdAt: Date;
}

export enum PointsTransactionType {
  EARNED = 'EARNED',
  REDEEMED = 'REDEEMED',
  EXPIRED = 'EXPIRED',
  ADJUSTED = 'ADJUSTED',
  BONUS = 'BONUS',
}

export class LoyaltyService {
  private readonly POINTS_PER_DOLLAR = 10; // 10 points per $1 spent
  private readonly TIER_THRESHOLDS = {
    BRONZE: 0,
    SILVER: 1000,
    GOLD: 5000,
    PLATINUM: 10000,
  };

  /**
   * Lookup member by phone number or member number
   */
  async lookupMember(
    phoneOrMemberNumber: string
  ): Promise<LoyaltyMember | null> {
    // Clean phone number (remove non-digits)
    const cleanPhone = phoneOrMemberNumber.replace(/\D/g, '');

    const result = await db.query(
      `SELECT
        id, member_number as "memberNumber",
        first_name as "firstName", last_name as "lastName",
        email, phone, points_balance as "pointsBalance",
        lifetime_points as "lifetimePoints", tier,
        joined_date as "joinedDate", last_visit as "lastVisit",
        is_active as "isActive"
      FROM loyalty_service.members
      WHERE (phone = $1 OR member_number = $2) AND is_active = true`,
      [cleanPhone, phoneOrMemberNumber]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Create new loyalty member
   */
  async createMember(
    firstName: string,
    lastName: string,
    phone: string,
    email?: string
  ): Promise<LoyaltyMember> {
    const memberId = uuidv4();
    const memberNumber = await this.generateMemberNumber();
    const cleanPhone = phone.replace(/\D/g, '');

    await db.query(
      `INSERT INTO loyalty_service.members (
        id, member_number, first_name, last_name, email, phone,
        points_balance, lifetime_points, tier, joined_date, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $7, NOW(), true)`,
      [
        memberId,
        memberNumber,
        firstName,
        lastName,
        email || null,
        cleanPhone,
        LoyaltyTier.BRONZE,
      ]
    );

    log.info('Loyalty member created', {
      memberId,
      memberNumber,
      phone: cleanPhone,
    });

    return {
      id: memberId,
      memberNumber,
      firstName,
      lastName,
      email,
      phone: cleanPhone,
      pointsBalance: 0,
      lifetimePoints: 0,
      tier: LoyaltyTier.BRONZE,
      joinedDate: new Date(),
      isActive: true,
    };
  }

  /**
   * Award points for purchase
   */
  async awardPoints(
    memberId: string,
    orderId: string,
    purchaseAmount: number
  ): Promise<number> {
    // Calculate points (10 points per $1)
    const pointsEarned = Math.floor(purchaseAmount * this.POINTS_PER_DOLLAR);

    if (pointsEarned <= 0) {
      return 0;
    }

    await db.transaction(async (client) => {
      // Add points to member balance
      await client.query(
        `UPDATE loyalty_service.members
         SET points_balance = points_balance + $1,
             lifetime_points = lifetime_points + $1,
             last_visit = NOW()
         WHERE id = $2`,
        [pointsEarned, memberId]
      );

      // Record points transaction
      await client.query(
        `INSERT INTO loyalty_service.points_transactions (
          id, member_id, transaction_type, points, order_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          uuidv4(),
          memberId,
          PointsTransactionType.EARNED,
          pointsEarned,
          orderId,
        ]
      );

      // Check for tier upgrade
      await this.checkTierUpgrade(client, memberId);
    });

    log.info('Points awarded', {
      memberId,
      orderId,
      pointsEarned,
      purchaseAmount,
    });

    return pointsEarned;
  }

  /**
   * Redeem reward
   */
  async redeemReward(
    memberId: string,
    rewardId: string,
    orderId?: string
  ): Promise<{ success: boolean; error?: string; discount?: number }> {
    try {
      // Get reward details
      const rewardResult = await db.query(
        `SELECT
          id, reward_name as "rewardName", points_cost as "pointsCost",
          reward_type as "rewardType", reward_value as "rewardValue",
          is_active as "isActive"
        FROM loyalty_service.rewards
        WHERE id = $1`,
        [rewardId]
      );

      if (rewardResult.rows.length === 0) {
        return { success: false, error: 'Reward not found' };
      }

      const reward = rewardResult.rows[0];

      if (!reward.isActive) {
        return { success: false, error: 'Reward is no longer available' };
      }

      // Get member
      const member = await this.lookupMember(memberId);
      if (!member) {
        return { success: false, error: 'Member not found' };
      }

      // Check if member has enough points
      if (member.pointsBalance < reward.pointsCost) {
        return {
          success: false,
          error: `Insufficient points. Need ${reward.pointsCost}, have ${member.pointsBalance}`,
        };
      }

      // Deduct points
      await db.transaction(async (client) => {
        await client.query(
          `UPDATE loyalty_service.members
           SET points_balance = points_balance - $1
           WHERE id = $2`,
          [reward.pointsCost, memberId]
        );

        // Record redemption
        await client.query(
          `INSERT INTO loyalty_service.points_transactions (
            id, member_id, transaction_type, points, reward_id, order_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            uuidv4(),
            memberId,
            PointsTransactionType.REDEEMED,
            -reward.pointsCost,
            rewardId,
            orderId || null,
          ]
        );
      });

      // Calculate discount value
      let discount = 0;
      if (reward.rewardType === RewardType.DOLLAR_OFF) {
        discount = reward.rewardValue;
      } else if (reward.rewardType === RewardType.PERCENT_OFF) {
        // Percent will be applied at cart level
        discount = reward.rewardValue;
      }

      log.info('Reward redeemed', {
        memberId,
        rewardId,
        rewardName: reward.rewardName,
        pointsCost: reward.pointsCost,
        discount,
      });

      return { success: true, discount };
    } catch (error) {
      log.error('Failed to redeem reward', error);
      return { success: false, error: 'Failed to redeem reward' };
    }
  }

  /**
   * Get available rewards for member
   */
  async getAvailableRewards(memberId: string): Promise<LoyaltyReward[]> {
    const member = await this.lookupMember(memberId);
    if (!member) {
      return [];
    }

    const result = await db.query(
      `SELECT
        id, reward_name as "rewardName", description,
        points_cost as "pointsCost", reward_type as "rewardType",
        reward_value as "rewardValue", is_active as "isActive"
      FROM loyalty_service.rewards
      WHERE is_active = true AND points_cost <= $1
      ORDER BY points_cost ASC`,
      [member.pointsBalance]
    );

    return result.rows;
  }

  /**
   * Get all rewards (for display)
   */
  async getAllRewards(): Promise<LoyaltyReward[]> {
    const result = await db.query(
      `SELECT
        id, reward_name as "rewardName", description,
        points_cost as "pointsCost", reward_type as "rewardType",
        reward_value as "rewardValue", is_active as "isActive"
      FROM loyalty_service.rewards
      WHERE is_active = true
      ORDER BY points_cost ASC`
    );

    return result.rows;
  }

  /**
   * Get points transaction history
   */
  async getPointsHistory(
    memberId: string,
    limit: number = 50
  ): Promise<PointsTransaction[]> {
    const result = await db.query(
      `SELECT
        id, member_id as "memberId", transaction_type as "transactionType",
        points, order_id as "orderId", reward_id as "rewardId",
        expires_at as "expiresAt", created_at as "createdAt"
      FROM loyalty_service.points_transactions
      WHERE member_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
      [memberId, limit]
    );

    return result.rows;
  }

  /**
   * Adjust points (admin/manager function)
   */
  async adjustPoints(
    memberId: string,
    points: number,
    reason: string,
    userId: string
  ): Promise<void> {
    await db.transaction(async (client) => {
      // Update balance
      await client.query(
        `UPDATE loyalty_service.members
         SET points_balance = points_balance + $1
         WHERE id = $2`,
        [points, memberId]
      );

      // Record adjustment
      await client.query(
        `INSERT INTO loyalty_service.points_transactions (
          id, member_id, transaction_type, points, created_at
        ) VALUES ($1, $2, $3, $4, NOW())`,
        [uuidv4(), memberId, PointsTransactionType.ADJUSTED, points]
      );

      // Log in audit trail
      log.warn('Loyalty points adjusted', {
        memberId,
        points,
        reason,
        adjustedBy: userId,
      });
    });
  }

  /**
   * Check and upgrade member tier
   */
  private async checkTierUpgrade(client: any, memberId: string): Promise<void> {
    const result = await client.query(
      `SELECT lifetime_points, tier FROM loyalty_service.members WHERE id = $1`,
      [memberId]
    );

    if (result.rows.length === 0) return;

    const { lifetime_points, tier } = result.rows[0];
    let newTier = tier;

    // Determine new tier
    if (lifetime_points >= this.TIER_THRESHOLDS.PLATINUM) {
      newTier = LoyaltyTier.PLATINUM;
    } else if (lifetime_points >= this.TIER_THRESHOLDS.GOLD) {
      newTier = LoyaltyTier.GOLD;
    } else if (lifetime_points >= this.TIER_THRESHOLDS.SILVER) {
      newTier = LoyaltyTier.SILVER;
    } else {
      newTier = LoyaltyTier.BRONZE;
    }

    // Update if tier changed
    if (newTier !== tier) {
      await client.query(
        `UPDATE loyalty_service.members SET tier = $1 WHERE id = $2`,
        [newTier, memberId]
      );

      log.info('Member tier upgraded', {
        memberId,
        oldTier: tier,
        newTier,
        lifetimePoints: lifetime_points,
      });
    }
  }

  /**
   * Generate unique member number
   */
  private async generateMemberNumber(): Promise<string> {
    // Format: LR + 8 digits (LR for Liquor River)
    const prefix = 'LR';
    let memberNumber: string;
    let exists = true;

    while (exists) {
      const randomDigits = Math.floor(10000000 + Math.random() * 90000000);
      memberNumber = `${prefix}${randomDigits}`;

      const result = await db.query(
        `SELECT id FROM loyalty_service.members WHERE member_number = $1`,
        [memberNumber]
      );

      exists = result.rows.length > 0;
    }

    return memberNumber!;
  }

  /**
   * Create default rewards
   */
  async createDefaultRewards(): Promise<void> {
    const rewards = [
      {
        rewardName: '$5 Off Purchase',
        description: 'Get $5 off your total purchase',
        pointsCost: 500,
        rewardType: RewardType.DOLLAR_OFF,
        rewardValue: 5.0,
      },
      {
        rewardName: '$10 Off Purchase',
        description: 'Get $10 off your total purchase',
        pointsCost: 1000,
        rewardType: RewardType.DOLLAR_OFF,
        rewardValue: 10.0,
      },
      {
        rewardName: '10% Off Purchase',
        description: 'Get 10% off your total purchase',
        pointsCost: 750,
        rewardType: RewardType.PERCENT_OFF,
        rewardValue: 0.1,
      },
      {
        rewardName: '$25 Off Purchase',
        description: 'Get $25 off your total purchase',
        pointsCost: 2500,
        rewardType: RewardType.DOLLAR_OFF,
        rewardValue: 25.0,
      },
      {
        rewardName: '20% Off Purchase',
        description: 'Get 20% off your total purchase',
        pointsCost: 2000,
        rewardType: RewardType.PERCENT_OFF,
        rewardValue: 0.2,
      },
    ];

    for (const reward of rewards) {
      await db.query(
        `INSERT INTO loyalty_service.rewards (
          id, reward_name, description, points_cost,
          reward_type, reward_value, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, true)
        ON CONFLICT (reward_name) DO NOTHING`,
        [
          uuidv4(),
          reward.rewardName,
          reward.description,
          reward.pointsCost,
          reward.rewardType,
          reward.rewardValue,
        ]
      );
    }

    log.info('Default loyalty rewards created');
  }

  /**
   * Get loyalty statistics
   */
  async getLoyaltyStats(): Promise<any> {
    const result = await db.query(
      `SELECT
        COUNT(*) as total_members,
        SUM(points_balance) as total_points,
        COUNT(CASE WHEN tier = 'BRONZE' THEN 1 END) as bronze_count,
        COUNT(CASE WHEN tier = 'SILVER' THEN 1 END) as silver_count,
        COUNT(CASE WHEN tier = 'GOLD' THEN 1 END) as gold_count,
        COUNT(CASE WHEN tier = 'PLATINUM' THEN 1 END) as platinum_count
      FROM loyalty_service.members
      WHERE is_active = true`
    );

    return {
      totalMembers: parseInt(result.rows[0].total_members),
      totalPoints: parseInt(result.rows[0].total_points || 0),
      tierDistribution: {
        bronze: parseInt(result.rows[0].bronze_count),
        silver: parseInt(result.rows[0].silver_count),
        gold: parseInt(result.rows[0].gold_count),
        platinum: parseInt(result.rows[0].platinum_count),
      },
    };
  }
}

// Singleton instance
export const loyaltyService = new LoyaltyService();
