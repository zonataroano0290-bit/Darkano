import crypto from 'node:crypto';
import Stripe from 'stripe';
import { db } from '../db/database.js';
import { CreditService } from './creditService.js';

export interface PlanRecord {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  billingInterval: string;
  creditsIncluded: number;
  features: string[];
  isActive: boolean;
  stripePriceId?: string | null;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  planId: string;
  planName?: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'unpaid';
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  providerPaymentId?: string | null;
  amountCents: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  planId?: string | null;
  creditsGranted: number;
  createdAt: string;
}

let stripeInstance: Stripe | null = null;

export class BillingService {
  /**
   * Check if Stripe payment provider is genuinely configured with credentials
   */
  static isStripeConfigured(): boolean {
    const key = process.env.STRIPE_SECRET_KEY;
    return typeof key === 'string' && key.trim().length > 0 && !key.includes('your_');
  }

  /**
   * Lazy-initialize Stripe client
   */
  static getStripe(): Stripe {
    if (!this.isStripeConfigured()) {
      throw new Error('Payment provider is not configured. STRIPE_SECRET_KEY is missing from environment.');
    }
    if (!stripeInstance) {
      stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!.trim(), {
        apiVersion: '2025-02-24.acacia' as any
      });
    }
    return stripeInstance;
  }

  /**
   * Get all active billing plans from database
   */
  static getPlans(): PlanRecord[] {
    const rows = db.prepare(`SELECT * FROM plans WHERE isActive = 1 ORDER BY priceCents ASC`).all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      priceCents: r.priceCents,
      currency: r.currency,
      billingInterval: r.billingInterval,
      creditsIncluded: r.creditsIncluded,
      features: r.featuresJson ? JSON.parse(r.featuresJson) : [],
      isActive: Boolean(r.isActive),
      stripePriceId: r.stripePriceId
    }));
  }

  /**
   * Get a specific plan by ID
   */
  static getPlanById(planId: string): PlanRecord | null {
    const r = db.prepare(`SELECT * FROM plans WHERE id = ?`).get(planId) as any;
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      priceCents: r.priceCents,
      currency: r.currency,
      billingInterval: r.billingInterval,
      creditsIncluded: r.creditsIncluded,
      features: r.featuresJson ? JSON.parse(r.featuresJson) : [],
      isActive: Boolean(r.isActive),
      stripePriceId: r.stripePriceId
    };
  }

  /**
   * Get active subscription for a user
   */
  static getUserSubscription(userId: string): SubscriptionRecord | null {
    const r = db.prepare(`
      SELECT s.*, p.name as planName
      FROM subscriptions s
      LEFT JOIN plans p ON s.planId = p.id
      WHERE s.userId = ? AND s.status IN ('active', 'trialing', 'past_due')
      ORDER BY s.createdAt DESC
      LIMIT 1
    `).get(userId) as any;

    if (!r) return null;

    return {
      id: r.id,
      userId: r.userId,
      providerCustomerId: r.providerCustomerId,
      providerSubscriptionId: r.providerSubscriptionId,
      planId: r.planId,
      planName: r.planName,
      status: r.status,
      currentPeriodStart: r.currentPeriodStart,
      currentPeriodEnd: r.currentPeriodEnd,
      cancelAtPeriodEnd: Boolean(r.cancelAtPeriodEnd),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }

  /**
   * Get past payments for a user
   */
  static getUserPayments(userId: string): PaymentRecord[] {
    const rows = db.prepare(`
      SELECT * FROM payments WHERE userId = ? ORDER BY createdAt DESC LIMIT 50
    `).all(userId) as any[];

    return rows.map(r => ({
      id: r.id,
      userId: r.userId,
      providerPaymentId: r.providerPaymentId,
      amountCents: r.amountCents,
      currency: r.currency,
      status: r.status,
      planId: r.planId,
      creditsGranted: r.creditsGranted,
      createdAt: r.createdAt
    }));
  }

  /**
   * Create real Stripe checkout session
   */
  static async createCheckoutSession(params: {
    userId: string;
    userEmail: string;
    planId: string;
    origin: string;
  }): Promise<{ checkoutUrl: string; sessionId: string }> {
    if (!this.isStripeConfigured()) {
      throw new Error('Payment provider is not configured. Please contact an administrator.');
    }

    const { userId, userEmail, planId, origin } = params;
    const plan = this.getPlanById(planId);
    if (!plan) {
      throw new Error('Requested plan does not exist');
    }

    if (plan.priceCents <= 0) {
      throw new Error('Free tier does not require payment checkout');
    }

    const stripe = this.getStripe();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: userEmail,
      client_reference_id: userId,
      metadata: {
        userId,
        planId: plan.id,
        creditsIncluded: String(plan.creditsIncluded)
      },
      line_items: [
        {
          price_data: {
            currency: plan.currency || 'usd',
            product_data: {
              name: plan.name,
              description: `${plan.creditsIncluded.toLocaleString()} Darkano AI credits per ${plan.billingInterval}`
            },
            unit_amount: plan.priceCents,
            recurring: {
              interval: plan.billingInterval === 'year' ? 'year' : 'month'
            }
          },
          quantity: 1
        }
      ],
      success_url: `${origin}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?billing=canceled`
    });

    if (!session.url) {
      throw new Error('Failed to create Stripe checkout session');
    }

    return {
      checkoutUrl: session.url,
      sessionId: session.id
    };
  }

  /**
   * Handle real Stripe webhook events with strict signature verification & idempotency
   */
  static async handleWebhookEvent(rawBody: Buffer, signature: string): Promise<{ received: boolean; eventType: string }> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured on this server');
    }

    const stripe = this.getStripe();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      console.error('[Darkano Billing] Stripe signature verification failed:', err?.message);
      throw new Error(`Webhook Signature Verification Failed: ${err?.message}`);
    }

    // Check duplicate webhook event
    const existing = db.prepare(`SELECT id, status FROM webhook_events WHERE providerEventId = ?`).get(event.id) as
      | { id: string; status: string }
      | undefined;

    if (existing && existing.status === 'processed') {
      console.log(`[Darkano Billing] Webhook event ${event.id} already processed. Skipping duplicate.`);
      return { received: true, eventType: event.type };
    }

    const now = new Date().toISOString();

    // Store in webhook_events table
    if (!existing) {
      db.prepare(`
        INSERT INTO webhook_events (id, providerEventId, eventType, status, payloadJson, createdAt)
        VALUES (?, ?, ?, 'processing', ?, ?)
      `).run(
        `whe_${crypto.randomUUID().replace(/-/g, '')}`,
        event.id,
        event.type,
        JSON.stringify(event.data.object),
        now
      );
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          await this.processCheckoutSessionCompleted(session);
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          await this.processInvoicePaymentSucceeded(invoice);
          break;
        }

        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          await this.processSubscriptionUpdated(sub);
          break;
        }

        case 'charge.refunded': {
          const charge = event.data.object as Stripe.Charge;
          await this.processChargeRefunded(charge);
          break;
        }

        default:
          console.log(`[Darkano Billing] Unhandled event type: ${event.type}`);
      }

      // Mark event as processed
      db.prepare(`
        UPDATE webhook_events SET status = 'processed', processedAt = ? WHERE providerEventId = ?
      `).run(new Date().toISOString(), event.id);

      return { received: true, eventType: event.type };
    } catch (processError: any) {
      console.error(`[Darkano Billing] Webhook processing error for ${event.id}:`, processError?.message);
      db.prepare(`
        UPDATE webhook_events SET status = 'failed', error = ?, processedAt = ? WHERE providerEventId = ?
      `).run(processError?.message || 'Processing failed', new Date().toISOString(), event.id);
      throw processError;
    }
  }

  /**
   * Process verified checkout.session.completed
   */
  private static async processCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
    const userId = session.client_reference_id || session.metadata?.userId;
    const planId = session.metadata?.planId;

    if (!userId || !planId) {
      console.warn('[Darkano Billing] Missing userId or planId on checkout session:', session.id);
      return;
    }

    const plan = this.getPlanById(planId);
    if (!plan) {
      console.warn('[Darkano Billing] Plan not found for checkout session:', planId);
      return;
    }

    const now = new Date().toISOString();

    // 1. Record payment
    const paymentId = `pay_${crypto.randomUUID().replace(/-/g, '')}`;
    db.prepare(`
      INSERT INTO payments (id, userId, providerPaymentId, amountCents, currency, status, planId, creditsGranted, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?)
    `).run(
      paymentId,
      userId,
      session.payment_intent as string || session.id,
      session.amount_total || plan.priceCents,
      session.currency || 'usd',
      plan.id,
      plan.creditsIncluded,
      now,
      now
    );

    // 2. Grant credits
    CreditService.addCredits({
      userId,
      amount: plan.creditsIncluded,
      type: 'purchase',
      source: 'stripe_checkout',
      metadata: {
        sessionId: session.id,
        planId: plan.id,
        planName: plan.name
      },
      idempotencyKey: `sub_grant_${session.id}`
    });

    // 3. Update profile plan
    db.prepare(`UPDATE profiles SET plan = ?, updatedAt = ? WHERE userId = ?`).run(
      plan.name,
      now,
      userId
    );

    // 4. Create or update subscription record
    const subId = session.subscription as string;
    const subRecordId = `sub_${crypto.randomUUID().replace(/-/g, '')}`;
    db.prepare(`
      INSERT INTO subscriptions (
        id, userId, providerCustomerId, providerSubscriptionId, planId, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      ON CONFLICT(providerSubscriptionId) DO UPDATE SET
        planId = excluded.planId,
        status = 'active',
        updatedAt = excluded.updatedAt
    `).run(
      subRecordId,
      userId,
      session.customer as string || null,
      subId || session.id,
      plan.id,
      now,
      now
    );

    // 5. Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, actorId, actorEmail, action, targetId, targetType, metadataJson, createdAt)
      VALUES (?, ?, ?, 'subscription_created', ?, 'plan', ?, ?)
    `).run(
      `aud_${crypto.randomUUID().replace(/-/g, '')}`,
      userId,
      session.customer_email || 'subscriber',
      plan.id,
      JSON.stringify({ planName: plan.name, credits: plan.creditsIncluded, amount: session.amount_total }),
      now
    );

    console.log(`[Darkano Billing] Successfully processed subscription for user ${userId}: plan ${plan.name} (+${plan.creditsIncluded} credits)`);
  }

  /**
   * Process recurring subscription invoice payment
   */
  private static async processInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    if (invoice.billing_reason === 'subscription_cycle') {
      const subId = (invoice as any).subscription as string;
      if (!subId) return;

      const sub = db.prepare(`SELECT * FROM subscriptions WHERE providerSubscriptionId = ?`).get(subId) as any;
      if (!sub) return;

      const plan = this.getPlanById(sub.planId);
      if (!plan) return;

      // Grant recurring credits
      CreditService.addCredits({
        userId: sub.userId,
        amount: plan.creditsIncluded,
        type: 'subscription_grant',
        source: 'stripe_renewal',
        metadata: { invoiceId: invoice.id, planName: plan.name },
        idempotencyKey: `inv_${invoice.id}`
      });

      console.log(`[Darkano Billing] Granted recurring credits to user ${sub.userId} for subscription cycle.`);
    }
  }

  /**
   * Process subscription update or cancellation
   */
  private static async processSubscriptionUpdated(sub: Stripe.Subscription) {
    const statusMap: Record<string, string> = {
      active: 'active',
      trialing: 'trialing',
      past_due: 'past_due',
      canceled: 'canceled',
      unpaid: 'unpaid',
      incomplete: 'incomplete'
    };

    const status = statusMap[sub.status] || 'canceled';
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE subscriptions
      SET status = ?,
          cancelAtPeriodEnd = ?,
          updatedAt = ?
      WHERE providerSubscriptionId = ?
    `).run(
      status,
      sub.cancel_at_period_end ? 1 : 0,
      now,
      sub.id
    );

    console.log(`[Darkano Billing] Updated subscription ${sub.id} status to ${status}`);
  }

  /**
   * Process refunded charge
   */
  private static async processChargeRefunded(charge: Stripe.Charge) {
    const payment = db.prepare(`SELECT * FROM payments WHERE providerPaymentId = ?`).get(charge.payment_intent as string || charge.id) as any;
    if (!payment) return;

    const now = new Date().toISOString();

    db.prepare(`UPDATE payments SET status = 'refunded', updatedAt = ? WHERE id = ?`).run(now, payment.id);

    // Record refund in credit transactions ledger
    CreditService.deductCredits({
      userId: payment.userId,
      amount: payment.creditsGranted,
      type: 'refund',
      source: 'stripe_refund',
      metadata: { chargeId: charge.id, paymentId: payment.id },
      idempotencyKey: `ref_${charge.id}`
    });

    console.log(`[Darkano Billing] Processed refund for charge ${charge.id} and adjusted credits.`);
  }

  /**
   * Cancel user subscription at period end
   */
  static async cancelSubscription(userId: string): Promise<{ success: boolean; message: string }> {
    const sub = this.getUserSubscription(userId);
    if (!sub) {
      throw new Error('No active subscription found for user');
    }

    if (!this.isStripeConfigured() || !sub.providerSubscriptionId) {
      // Local cancellation
      db.prepare(`UPDATE subscriptions SET cancelAtPeriodEnd = 1, updatedAt = ? WHERE id = ?`).run(
        new Date().toISOString(),
        sub.id
      );
      return { success: true, message: 'Subscription marked to cancel at end of billing cycle.' };
    }

    const stripe = this.getStripe();
    await stripe.subscriptions.update(sub.providerSubscriptionId, {
      cancel_at_period_end: true
    });

    db.prepare(`UPDATE subscriptions SET cancelAtPeriodEnd = 1, updatedAt = ? WHERE id = ?`).run(
      new Date().toISOString(),
      sub.id
    );

    return { success: true, message: 'Subscription will cancel automatically at the end of the current billing cycle.' };
  }
}
