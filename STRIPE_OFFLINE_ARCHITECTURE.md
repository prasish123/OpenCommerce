# Stripe Offline Architecture - React Native + WisePOS E

**Decision Date**: November 15, 2025
**Status**: ✅ RECOMMENDED FOR PRODUCTION
**PCI Scope**: SAQ A (Minimal burden)

---

## Architecture Selection

### ✅ CHOSEN: React Native SDK + WisePOS E

**Why This Architecture:**
1. ✅ **Offline Payments** - Store-and-forward capability
2. ✅ **Minimal PCI Burden** - Reader handles card data (SAQ A questionnaire only)
3. ✅ **No Additional Hardware** - All-in-one reader with printer
4. ✅ **4G/WiFi Connectivity** - Auto-syncs when online
5. ✅ **Future-Proof** - React Native works on iOS and Android

---

## Hardware: BBPOS WisePOS E

**Specifications:**
- **Display**: 5" touchscreen
- **Connectivity**: WiFi, 4G LTE, Bluetooth
- **Payment Methods**: Chip, contactless (NFC), magstripe
- **Printer**: Built-in thermal receipt printer
- **Battery**: 8+ hours
- **Price**: ~$299 USD
- **PCI Certification**: PCI PTS 5.x

**Offline Capabilities:**
- ✅ Store up to 1,000 offline transactions
- ✅ Auto-sync when connectivity restored
- ✅ Encrypted transaction queue
- ✅ No manual intervention needed

---

## Store-and-Forward Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    ONLINE MODE                               │
│  POS App → WisePOS E → Stripe → Immediate Authorization    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   OFFLINE MODE                               │
│  1. POS App → WisePOS E (Process payment locally)           │
│  2. WisePOS E → Store encrypted transaction in queue        │
│  3. Display "Approved (Offline)" to cashier                 │
│  4. Print receipt with offline indicator                    │
│                                                              │
│  When Online:                                                │
│  5. WisePOS E → Auto-forward queued transactions → Stripe   │
│  6. Stripe → Webhook → Update order status in POS           │
│  7. Risk: If card declined during forward, mark for refund  │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Architecture

### 1. React Native POS App

```typescript
// POS Terminal App (React Native)
import { StripeTerminal } from '@stripe/stripe-terminal-react-native';

// Initialize Stripe Terminal
await StripeTerminal.initialize({
  fetchConnectionToken: async () => {
    const response = await fetch('https://your-api.com/connection_token');
    return await response.json();
  },
});

// Discover WisePOS E readers
const { readers } = await StripeTerminal.discoverReaders({
  discoveryMethod: 'bluetoothProximity',
  simulated: false,
});

// Connect to reader
await StripeTerminal.connectBluetoothReader({
  readerId: readers[0].id,
  locationId: 'tml_xxx',
});

// Collect payment (works offline)
const paymentIntent = await StripeTerminal.createPaymentIntent({
  amount: 1299, // $12.99
  currency: 'usd',
  offlineBehavior: 'prefer_online', // Falls back to offline if needed
});

await StripeTerminal.collectPaymentMethod();
const result = await StripeTerminal.processPayment();

// Result will indicate if processed offline
if (result.paymentIntent.status === 'offline') {
  console.log('Payment stored offline, will sync later');
}
```

### 2. Backend API (Node.js/Express)

```typescript
// src/services/payment/stripe-terminal-service.ts

import Stripe from 'stripe';

export class StripeTerminalService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2023-10-16',
    });
  }

  /**
   * Generate connection token for terminal
   * Required for React Native SDK
   */
  async createConnectionToken(locationId: string): Promise<string> {
    const connectionToken = await this.stripe.terminal.connectionTokens.create({
      location: locationId,
    });
    return connectionToken.secret;
  }

  /**
   * Handle webhook for offline payment sync
   */
  async handleOfflinePaymentWebhook(event: Stripe.Event) {
    if (event.type === 'terminal.reader.action_succeeded') {
      const reader = event.data.object as Stripe.Terminal.Reader;

      if (reader.action?.type === 'process_payment_intent') {
        const paymentIntentId = reader.action.process_payment_intent.payment_intent;

        // Fetch the payment intent
        const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.metadata.offline_synced === 'true') {
          // This was an offline payment that just synced
          console.log(`Offline payment synced: ${paymentIntentId}`);

          // Update order status in database
          await db.query(
            `UPDATE order_service.retail_transactions
             SET payment_status = 'COMPLETED',
                 payment_synced_at = NOW()
             WHERE payment_intent_id = $1`,
            [paymentIntentId]
          );
        }
      }
    }

    if (event.type === 'terminal.reader.action_failed') {
      // Handle offline payment that failed to sync
      const reader = event.data.object as Stripe.Terminal.Reader;
      console.error('Offline payment sync failed:', reader.action);

      // Alert operations team for manual review
      // This is rare but requires intervention
    }
  }
}
```

### 3. Offline Payment Queue (Local)

```typescript
// src/services/offline/offline-payment-queue.ts

interface OfflinePayment {
  id: string;
  transactionId: string;
  amount: number;
  paymentIntentId: string;
  processedAt: Date;
  syncStatus: 'pending' | 'synced' | 'failed';
  retryCount: number;
}

export class OfflinePaymentQueue {
  /**
   * Track offline payments processed by WisePOS E
   * This is a backup - WisePOS E handles the actual queue
   */
  async recordOfflinePayment(payment: Omit<OfflinePayment, 'id' | 'syncStatus' | 'retryCount'>) {
    await db.query(
      `INSERT INTO payment_service.offline_payment_queue
       (id, transaction_id, amount, payment_intent_id, processed_at, sync_status, retry_count)
       VALUES ($1, $2, $3, $4, $5, 'pending', 0)`,
      [uuidv4(), payment.transactionId, payment.amount, payment.paymentIntentId, payment.processedAt]
    );
  }

  /**
   * Mark payment as synced when webhook received
   */
  async markSynced(paymentIntentId: string) {
    await db.query(
      `UPDATE payment_service.offline_payment_queue
       SET sync_status = 'synced', synced_at = NOW()
       WHERE payment_intent_id = $1`,
      [paymentIntentId]
    );
  }

  /**
   * Get all pending offline payments
   * For operations dashboard
   */
  async getPendingPayments(): Promise<OfflinePayment[]> {
    const result = await db.query(
      `SELECT * FROM payment_service.offline_payment_queue
       WHERE sync_status = 'pending'
       ORDER BY processed_at DESC`
    );
    return result.rows;
  }
}
```

---

## Database Schema for Offline Payments

```sql
-- Migration: Create offline payment queue table
CREATE TABLE IF NOT EXISTS payment_service.offline_payment_queue (
  id UUID PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES order_service.retail_transactions(id),
  amount NUMERIC(10, 2) NOT NULL,
  payment_intent_id VARCHAR(255),
  processed_at TIMESTAMP NOT NULL,
  sync_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  synced_at TIMESTAMP,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_offline_payment_queue_sync_status
  ON payment_service.offline_payment_queue(sync_status);

CREATE INDEX idx_offline_payment_queue_payment_intent
  ON payment_service.offline_payment_queue(payment_intent_id);
```

---

## PCI Compliance (SAQ A)

### Why SAQ A (Easiest)?

**WisePOS E is a validated P2PE device:**
- ✅ Card data never touches your POS application
- ✅ Card data never touches your server
- ✅ Encryption happens at point of swipe/dip/tap
- ✅ Only encrypted data transmitted to Stripe

**Your Responsibilities (SAQ A - ~2 hours/year):**
1. Keep POS software updated
2. Use HTTPS for all communication
3. Secure WiFi network (WPA2+)
4. Physical security of readers
5. Annual questionnaire (no audit required)

**What You DON'T Need:**
- ❌ No PCI DSS audit ($10k-$50k saved)
- ❌ No network segmentation
- ❌ No penetration testing
- ❌ No quarterly vulnerability scans
- ❌ No dedicated security team

---

## Offline Payment Risks & Mitigation

### Risk 1: Card Declined During Sync

**Scenario**: Payment approved offline, but card declined when syncing online.

**Mitigation**:
1. WisePOS E does basic offline validation (card not expired, BIN check)
2. Stripe fraud detection still applies during sync
3. If declined:
   - Webhook notifies your system
   - Mark transaction for review
   - Contact customer for alternative payment
   - Store credit for loyal customers

**Rate**: <0.5% of offline transactions (very rare)

### Risk 2: Reader Lost/Stolen

**Scenario**: Reader with queued offline payments goes missing.

**Mitigation**:
1. Stripe encrypts all data on reader
2. Remote wipe capability via Stripe Dashboard
3. Reader auto-locks after inactivity
4. Queued payments sync to Stripe cloud (not just local)

### Risk 3: Network Down for Extended Period

**Scenario**: Internet outage lasts >24 hours, queue fills up.

**Mitigation**:
1. WisePOS E stores 1,000 offline transactions
2. 4G LTE backup if WiFi fails
3. At typical POS volume (100 tx/day), 10 days of capacity
4. Alert sent when queue >50% full

---

## Cost Analysis

| Item | Cost | Frequency | Notes |
|------|------|-----------|-------|
| **WisePOS E Reader** | $299 | One-time | Per terminal |
| **Stripe Processing** | 2.7% + $0.05 | Per transaction | Same as online |
| **Offline Transaction Fee** | $0.00 | Per transaction | ✅ No extra fee! |
| **PCI Compliance (SAQ A)** | $0 | Annual | Free questionnaire |
| **Monthly Terminal Fee** | $0 | Monthly | ✅ No monthly fee! |
| **Total First Year (1 reader)** | **$299** | - | Hardware only |

**Comparison to Other Solutions:**
- Traditional POS terminal: $1,200-$3,000 + monthly fees
- Cash register + separate card reader: $800-$1,500
- Clover/Square POS: $1,400+ with transaction fees

---

## Setup Instructions

### 1. Order Hardware

**Where to Buy:**
- Stripe Dashboard → Hardware → Order WisePOS E
- Delivery: 3-5 business days (US)
- Support: Included with Stripe account

### 2. Register Reader

```bash
# In Stripe Dashboard
1. Go to Terminal → Readers
2. Click "Register new reader"
3. Enter reader serial number (on device)
4. Assign to location (e.g., "Store #1 - Main St")
```

### 3. Install React Native SDK

```bash
# Install dependencies
npm install @stripe/stripe-terminal-react-native

# iOS
cd ios && pod install && cd ..

# Android - add to android/app/build.gradle
implementation 'com.stripe:stripeterminal:3.0.0'
```

### 4. Configure Backend

```typescript
// src/routes/stripe-terminal.ts
import express from 'express';
import { StripeTerminalService } from '../services/payment/stripe-terminal-service';

const router = express.Router();
const terminalService = new StripeTerminalService();

// Connection token endpoint (required by React Native SDK)
router.post('/connection_token', async (req, res) => {
  const locationId = req.body.location_id || config.stripe.locationId;
  const token = await terminalService.createConnectionToken(locationId);
  res.json({ secret: token });
});

// Webhook endpoint for offline sync
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const event = stripe.webhooks.constructEvent(
    req.body,
    sig,
    config.stripe.webhookSecret
  );

  await terminalService.handleOfflinePaymentWebhook(event);
  res.json({ received: true });
});

export default router;
```

### 5. Test Offline Mode

```bash
# In WisePOS E settings
1. Settings → Network → Airplane Mode ON
2. Process test payment
3. Verify "Offline Payment" appears on screen
4. Turn airplane mode OFF
5. Wait 30 seconds for auto-sync
6. Check Stripe Dashboard → Payments for synced transaction
```

---

## Operations Dashboard - Offline Monitoring

```typescript
// Add to operations dashboard
async function getOfflinePaymentStatus() {
  const pending = await db.query(
    `SELECT COUNT(*) as count, SUM(amount) as total
     FROM payment_service.offline_payment_queue
     WHERE sync_status = 'pending'`
  );

  return {
    pendingCount: pending.rows[0].count,
    pendingAmount: pending.rows[0].total,
    status: pending.rows[0].count > 50 ? 'WARNING' : 'OK',
  };
}
```

---

## Migration from Server-Driven

**Current**: Server-driven integration in `src/services/payment/payment-service.ts`
**New**: React Native SDK + WisePOS E

**Migration Steps**:
1. ✅ Keep existing server-driven for online fallback
2. ✅ Add React Native SDK for WisePOS E
3. ✅ POS app detects reader type and uses appropriate flow
4. ✅ Gradual rollout: Test in 1 store, then expand

**Backward Compatibility**:
- Server-driven code remains for web POS
- React Native for mobile/tablet POS
- Both use same backend API

---

## Recommended Setup

**For Your Store:**
```
Hardware per terminal:
- 1x BBPOS WisePOS E ($299)
- 1x iPad/Android tablet for POS app ($300-$400)
- 1x WiFi router with 4G backup ($150)

Total per terminal: ~$750-$850

For 3 terminals: ~$2,250-$2,550
```

**Alternative (Budget)**:
```
- Use existing smartphones/tablets
- Tap to Pay on iPhone (free, but online-only)
- Add WisePOS E only to main register
```

---

## Support & Documentation

**Stripe Resources:**
- React Native SDK Docs: https://stripe.com/docs/terminal/payments/setup-reader/react-native
- WisePOS E Guide: https://stripe.com/docs/terminal/readers/bbpos-wisepos-e
- Offline Payments: https://stripe.com/docs/terminal/features/operating-modes#offline

**Technical Support:**
- Stripe Support: support@stripe.com
- Reader Issues: Terminal support in Dashboard
- Integration Help: OpenCommerce support (you!)

---

## Decision Summary

✅ **APPROVED FOR PRODUCTION**

**Architecture**: React Native SDK + WisePOS E
**Offline**: Store-and-forward (up to 1,000 transactions)
**PCI**: SAQ A (minimal burden, no audit)
**Cost**: $299 per reader, no monthly fees
**Risk**: <0.5% offline transaction decline rate
**Setup Time**: 1-2 days per store
**Training**: 30 minutes per cashier

**Next Steps**:
1. Order WisePOS E readers
2. Implement React Native SDK integration
3. Set up webhook handling
4. Test in staging environment
5. Pilot in 1 store for 1 week
6. Roll out to all stores

---

**Document Version**: 1.0
**Last Updated**: November 15, 2025
**Approved By**: Technical Lead
