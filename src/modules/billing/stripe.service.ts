import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeSDK = require('stripe');

import { WorkspaceSubscription, SubscriptionPlan } from './entities/workspace-subscription.entity';
import { UsageRecord } from './entities/usage-record.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { WorkspaceUser } from '../workspaces/entities/workspace-user.entity';
import { MailService } from '../../common/mail/mail.service';
import type { INotificationGateway } from '../../notifications/notification.gateway';

// ── Minimal local webhook-event types ───────────────────────────────────────
// Avoids the stripe v22 CJS / emitDecoratorMetadata namespace collision.
interface StripeEventObject { [key: string]: any }
interface StripeWebhookEvent {
  type: string;
  data: { object: StripeEventObject };
}
interface StripeCheckoutSession extends StripeEventObject {
  metadata?: Record<string, string>;
  customer: string;
  subscription: string | null;
}
interface StripeSubscription extends StripeEventObject {
  id: string;
  customer: string;
  status: string;
  items: { data: Array<{ price: { id: string }; id: string }> };
  current_period_start: number;
  current_period_end: number;
  cancel_at: number | null;
}
interface StripeInvoice extends StripeEventObject {
  customer: string;
}

// ── Plan → Stripe price mapping ─────────────────────────────────────────────
// Loaded from env; never hardcoded.
const PLAN_PRICE_ENV_MAP: Record<SubscriptionPlan, string> = {
  starter:    'STRIPE_PRICE_STARTER',
  pro:        'STRIPE_PRICE_PRO',
  enterprise: 'STRIPE_PRICE_ENTERPRISE',
};

function priceIdToPlan(priceId: string, config: ConfigService): SubscriptionPlan {
  for (const [plan, envKey] of Object.entries(PLAN_PRICE_ENV_MAP) as [SubscriptionPlan, string][]) {
    if (config.get<string>(envKey) === priceId) return plan;
  }
  return 'starter';
}

// ── In-process plan cache type ───────────────────────────────────────────────
// Replace with Redis in Phase 4 — same interface, swap implementation only.
type PlanCacheEntry = { result: 'ok' | 'past_due' | 'cancelled'; expiresAt: number };

// ── Upsert fields (no relation objects) ─────────────────────────────────────
interface SubscriptionFields {
  stripeCustomerId: string;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  plan?: SubscriptionPlan;
  status?: WorkspaceSubscription['status'];
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
}

@Injectable()
export class StripeService {
  // stripe is typed as any to avoid CJS/emitDecoratorMetadata namespace conflict with stripe v22
  private readonly stripe: any;
  private readonly logger = new Logger(StripeService.name);
  // Instance-level cache so each service instance starts clean (important for tests)
  private readonly planCache = new Map<string, PlanCacheEntry>();

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(WorkspaceSubscription)
    private readonly subRepo: Repository<WorkspaceSubscription>,
    @InjectRepository(UsageRecord)
    private readonly usageRepo: Repository<UsageRecord>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceUser)
    private readonly workspaceUserRepo: Repository<WorkspaceUser>,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
    @Inject('NOTIFICATION_GATEWAY')
    private readonly gateway: INotificationGateway,
  ) {
    this.stripe = new StripeSDK(config.getOrThrow<string>('STRIPE_SECRET_KEY'));
  }

  // ── createCheckoutSession ────────────────────────────────────────────────

  async createCheckoutSession(
    workspaceId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<{ url: string }> {
    const customerId = await this.getOrCreateCustomer(workspaceId);

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { workspaceId },
    });

    return { url: session.url! };
  }

  // ── handleWebhook ────────────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const secret = this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');

    let event: StripeWebhookEvent;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      throw new BadRequestException(
        `Webhook signature verification failed: ${(err as Error).message}`,
      );
    }

    // Return 200 immediately; process async so Stripe doesn't time out.
    setImmediate(() =>
      this.processEvent(event).catch((e) =>
        this.logger.error(`Webhook processing error for ${event.type}: ${(e as Error).message}`),
      ),
    );
  }

  private async processEvent(event: StripeWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object as StripeCheckoutSession);
        break;
      case 'customer.subscription.updated':
        await this.onSubscriptionUpdated(event.data.object as StripeSubscription);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(event.data.object as StripeSubscription);
        break;
      case 'invoice.payment_failed':
        await this.onPaymentFailed(event.data.object as StripeInvoice);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }
  }

  private async onCheckoutCompleted(session: StripeCheckoutSession): Promise<void> {
    const workspaceId = session.metadata?.workspaceId;
    if (!workspaceId) return;

    const sub = session.subscription
      ? await this.stripe.subscriptions.retrieve(session.subscription as string)
      : null;

    const priceId = sub?.items.data[0]?.price.id ?? null;
    const plan    = priceId ? priceIdToPlan(priceId, this.config) : 'starter';

    await this.upsertSubscription(workspaceId, {
      stripeCustomerId:    session.customer as string,
      stripeSubscriptionId: sub?.id ?? null,
      stripePriceId:       priceId,
      plan,
      status: 'active',
      currentPeriodStart: sub ? new Date(sub.current_period_start * 1000) : null,
      currentPeriodEnd:   sub ? new Date(sub.current_period_end   * 1000) : null,
    });

    await this.workspaceRepo.update({ id: workspaceId }, { plan });
    this.planCache.delete(workspaceId);
  }

  private async onSubscriptionUpdated(sub: StripeSubscription): Promise<void> {
    const workspaceId = await this.workspaceIdByCustomer(sub.customer as string);
    if (!workspaceId) return;

    const priceId = sub.items.data[0]?.price.id ?? null;
    const plan    = priceId ? priceIdToPlan(priceId, this.config) : 'starter';
    const status  = this.mapStripeStatus(sub.status);

    await this.upsertSubscription(workspaceId, {
      stripeCustomerId:    sub.customer as string,
      stripeSubscriptionId: sub.id,
      stripePriceId:       priceId,
      plan,
      status,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd:   new Date(sub.current_period_end   * 1000),
    });

    await this.workspaceRepo.update({ id: workspaceId }, { plan });
    this.planCache.delete(workspaceId);
  }

  private async onSubscriptionDeleted(sub: StripeSubscription): Promise<void> {
    const workspaceId = await this.workspaceIdByCustomer(sub.customer as string);
    if (!workspaceId) return;

    await this.subRepo.update({ workspaceId }, { status: 'cancelled', plan: 'starter' });
    await this.workspaceRepo.update({ id: workspaceId }, { plan: 'starter' });
    this.planCache.delete(workspaceId);
  }

  private async onPaymentFailed(invoice: StripeInvoice): Promise<void> {
    const workspaceId = await this.workspaceIdByCustomer(invoice.customer as string);
    if (!workspaceId) return;

    await this.subRepo.update({ workspaceId }, { status: 'past_due' });
    this.planCache.delete(workspaceId);

    // Email all workspace admins
    const admins = await this.workspaceUserRepo.find({
      where: { workspaceId, role: 'admin', status: 'active' },
      relations: ['user'],
    });
    for (const admin of admins) {
      await this.mailService
        .sendMail({
          to: admin.user.email,
          subject: 'Payment failed — action required',
          html: `<p>Your SocialMetrics subscription payment failed. Please update your payment method to avoid service interruption.</p>`,
        })
        .catch((e: Error) =>
          this.logger.warn(`Failed to send payment-failed email: ${e.message}`),
        );
    }

    // In-app notification (workspace broadcast)
    await this.gateway.sendToWorkspace(workspaceId, {
      type: 'billing.payment_failed',
      title: 'Payment failed',
      body: 'Your subscription payment failed. Please update your payment method.',
      createdAt: new Date(),
    });
  }

  // ── recordUsage ──────────────────────────────────────────────────────────

  async recordUsage(workspaceId: string, metric: string, quantity: number): Promise<void> {
    const record = this.usageRepo.create({ workspaceId, metric, quantity });

    const sub = await this.subRepo.findOne({ where: { workspaceId } });
    if (sub?.stripeSubscriptionId && sub.stripePriceId) {
      try {
        const subData = await this.stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
        const itemId  = subData.items.data.find((i) => i.price.id === sub.stripePriceId)?.id;
        if (itemId) {
          const usageRecord = await this.stripe.subscriptionItems.createUsageRecord(itemId, {
            quantity,
            timestamp: Math.floor(Date.now() / 1000),
            action: 'increment',
          });
          record.stripeUsageRecordId = usageRecord.id;
        }
      } catch (err) {
        this.logger.warn(`Stripe usage record failed for ${metric}: ${(err as Error).message}`);
      }
    }

    await this.usageRepo.save(record);
  }

  // ── enforcePlan ──────────────────────────────────────────────────────────

  async enforcePlan(workspaceId: string, isWriteRequest: boolean): Promise<void> {
    const cached = this.planCache.get(workspaceId);
    if (cached && cached.expiresAt > Date.now()) {
      this.applyPlanPolicy(cached.result, isWriteRequest);
      return;
    }

    const sub    = await this.subRepo.findOne({ where: { workspaceId } });
    const result: 'ok' | 'past_due' | 'cancelled' =
      !sub || sub.status === 'active' || sub.status === 'trialing'
        ? 'ok'
        : sub.status === 'past_due'
        ? 'past_due'
        : 'cancelled';

    this.planCache.set(workspaceId, { result, expiresAt: Date.now() + 5 * 60 * 1000 });
    this.applyPlanPolicy(result, isWriteRequest);
  }

  private applyPlanPolicy(result: 'ok' | 'past_due' | 'cancelled', isWriteRequest: boolean): void {
    if (result === 'ok') return;

    if (result === 'past_due' && isWriteRequest) {
      throw new HttpException(
        'Payment past due — writes are blocked. Please update your payment method.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    if (result === 'cancelled' && isWriteRequest) {
      throw new ForbiddenException('Subscription cancelled — workspace downgraded to starter plan.');
    }
  }

  // ── cancelSubscription ───────────────────────────────────────────────────

  async cancelSubscription(workspaceId: string): Promise<void> {
    const sub = await this.subRepo.findOne({ where: { workspaceId } });
    if (!sub?.stripeSubscriptionId) throw new BadRequestException('No active subscription');

    const updated = await this.stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    await this.subRepo.update({ workspaceId }, {
      cancelAt: updated.cancel_at ? new Date(updated.cancel_at * 1000) : null,
    });
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private async getOrCreateCustomer(workspaceId: string): Promise<string> {
    const existing = await this.subRepo.findOne({ where: { workspaceId } });
    if (existing?.stripeCustomerId) return existing.stripeCustomerId;

    const workspace = await this.workspaceRepo.findOneOrFail({ where: { id: workspaceId } });
    const customer  = await this.stripe.customers.create({
      name: workspace.name,
      metadata: { workspaceId },
    });

    await this.subRepo
      .createQueryBuilder()
      .insert()
      .into(WorkspaceSubscription)
      .values({
        workspaceId,
        stripeCustomerId: customer.id,
        plan: 'starter',
        status: 'trialing',
      })
      .orIgnore()
      .execute();

    return customer.id;
  }

  private async upsertSubscription(
    workspaceId: string,
    fields: SubscriptionFields,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO workspace_subscriptions
         (workspace_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
          plan, status, current_period_start, current_period_end, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
       ON CONFLICT (workspace_id) DO UPDATE SET
         stripe_customer_id     = EXCLUDED.stripe_customer_id,
         stripe_subscription_id = EXCLUDED.stripe_subscription_id,
         stripe_price_id        = EXCLUDED.stripe_price_id,
         plan                   = EXCLUDED.plan,
         status                 = EXCLUDED.status,
         current_period_start   = EXCLUDED.current_period_start,
         current_period_end     = EXCLUDED.current_period_end,
         updated_at             = now()`,
      [
        workspaceId,
        fields.stripeCustomerId,
        fields.stripeSubscriptionId ?? null,
        fields.stripePriceId ?? null,
        fields.plan ?? 'starter',
        fields.status ?? 'active',
        fields.currentPeriodStart ?? null,
        fields.currentPeriodEnd ?? null,
      ],
    );
  }

  private async workspaceIdByCustomer(customerId: string): Promise<string | null> {
    const sub = await this.subRepo.findOne({ where: { stripeCustomerId: customerId } });
    return sub?.workspaceId ?? null;
  }

  private mapStripeStatus(status: string): WorkspaceSubscription['status'] {
    switch (status) {
      case 'active':   return 'active';
      case 'trialing': return 'trialing';
      case 'past_due': return 'past_due';
      default:         return 'cancelled';
    }
  }
}
