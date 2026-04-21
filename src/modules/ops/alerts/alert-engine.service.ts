import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AlertRule, TimeWindow } from './entities/alert-rule.entity';
import { InsightCard, InsightSeverity } from './entities/insight-card.entity';
import { InAppNotification } from './entities/in-app-notification.entity';
import { Workspace } from '../../workspaces/entities/workspace.entity';
import { WorkspaceUser } from '../../workspaces/entities/workspace-user.entity';
import { MailService } from '../../../common/mail/mail.service';
import type {
  INotificationGateway,
  NotificationEvent,
} from '../../../notifications/notification.gateway';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------
interface PeriodBounds {
  currentStart: Date;
  currentEnd: Date;
  prevStart: Date;
  prevEnd: Date;
}

@Injectable()
export class AlertEngineService {
  private readonly logger = new Logger(AlertEngineService.name);

  constructor(
    @InjectRepository(AlertRule)
    private readonly ruleRepo: Repository<AlertRule>,
    @InjectRepository(InsightCard)
    private readonly insightRepo: Repository<InsightCard>,
    @InjectRepository(InAppNotification)
    private readonly notifRepo: Repository<InAppNotification>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceUser)
    private readonly workspaceUserRepo: Repository<WorkspaceUser>,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
    @Inject('NOTIFICATION_GATEWAY')
    private readonly gateway: INotificationGateway,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async evaluateWorkspace(workspaceId: string): Promise<void> {
    const rules = await this.ruleRepo.find({
      where: { workspaceId, enabled: true },
    });

    let fired = 0;
    for (const rule of rules) {
      try {
        const didFire = await this.evaluateRule(rule);
        if (didFire) fired++;
        await this.ruleRepo.update(rule.id, { lastEvaluated: new Date() });
      } catch (err) {
        // One bad rule must not block subsequent rules
        this.logger.error(
          `Rule evaluation failed rule=${rule.id} workspace=${workspaceId}: ${err}`,
        );
        // Still stamp last_evaluated so we know it ran
        try {
          await this.ruleRepo.update(rule.id, { lastEvaluated: new Date() });
        } catch {
          // ignore secondary failure
        }
      }
    }

    this.logger.log(
      `evaluateWorkspace workspace=${workspaceId} rules=${rules.length} fired=${fired}`,
    );
  }

  async evaluateAll(): Promise<void> {
    const workspaces = await this.workspaceRepo.find({ select: ['id'] });
    let totalFired = 0;

    for (const ws of workspaces) {
      try {
        const rulesBefore = await this.ruleRepo.count({
          where: { workspaceId: ws.id, enabled: true },
        });
        await this.evaluateWorkspace(ws.id);
        // Count newly triggered rules (last_triggered updated in this run)
        const nowStr = new Date().toISOString();
        void nowStr; // used for logging label only
        totalFired += rulesBefore; // approximate; real count logged per workspace
      } catch (err) {
        // One failing workspace must never block others
        this.logger.error(`evaluateAll failed for workspace=${ws.id}: ${err}`);
      }
    }

    this.logger.log(
      `evaluateAll evaluated ${workspaces.length} workspaces`,
    );
  }

  // ---------------------------------------------------------------------------
  // Private — rule evaluation
  // ---------------------------------------------------------------------------

  private async evaluateRule(rule: AlertRule): Promise<boolean> {
    const { currentStart, currentEnd, prevStart, prevEnd } = this.periodBounds(
      rule.timeWindow,
    );

    const current = await this.queryMetric(
      rule.metricFamily,
      currentStart,
      currentEnd,
    );
    const prev = await this.queryMetric(rule.metricFamily, prevStart, prevEnd);

    const fired = this.evaluate(rule.operator, current, prev, rule.threshold);
    if (!fired) return false;

    // -----------------------------------------------------------------------
    // Rule fired — write side-effects
    // -----------------------------------------------------------------------
    const severity = this.deriveSeverity(rule.operator, rule.threshold, current, prev);
    const metricSummary = this.buildSummary(rule, current, prev);

    // 1. InsightCard — 30-day flat expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    const card = this.insightRepo.create({
      workspaceId: rule.workspaceId,
      type: `alert.${rule.metricFamily}`,
      severity,
      title: rule.name,
      body: metricSummary,
      payload: {
        ruleId: rule.id,
        operator: rule.operator,
        threshold: rule.threshold,
        current,
        prev,
        timeWindow: rule.timeWindow,
      },
      expiresAt,
    });
    await this.insightRepo.save(card);

    // 2. InAppNotification (user_id = null = workspace broadcast)
    const notif = this.notifRepo.create({
      workspaceId: rule.workspaceId,
      userId: null,
      type: `alert.${rule.metricFamily}`,
      title: rule.name,
      body: metricSummary,
    });
    await this.notifRepo.save(notif);

    // 3. Email — only if 'email' in channels; never throws
    if (rule.channels.includes('email')) {
      const admins = await this.workspaceUserRepo.find({
        where: { workspaceId: rule.workspaceId, role: 'admin', status: 'active' },
        relations: ['user'],
      });
      for (const member of admins) {
        try {
          await this.mailService.sendAlertEmail(
            member.user.email,
            rule.name,
            metricSummary,
          );
        } catch (err) {
          this.logger.error(
            `Alert email failed rule=${rule.id} to=${member.user.email}: ${err}`,
          );
        }
      }
    }

    // 4. SSE push
    const event: NotificationEvent = {
      type: `alert.${rule.metricFamily}`,
      title: rule.name,
      body: metricSummary,
      payload: { ruleId: rule.id, severity, current, prev },
      createdAt: new Date(),
    };
    await this.gateway.sendToWorkspace(rule.workspaceId, event);

    // 5. Stamp last_triggered
    await this.ruleRepo.update(rule.id, { lastTriggered: new Date() });

    return true;
  }

  // ---------------------------------------------------------------------------
  // Private — metric queries
  // ---------------------------------------------------------------------------

  /**
   * Query the aggregate metric for the given family and date window.
   *
   * traffic   → SUM(daily_analytics.sessions)   for the period
   *             Note: daily_analytics has no workspace_id; evaluates globally.
   *             The alert rule itself is workspace-scoped.
   * revenue   → SUM(daily_revenue."totalRevenue") for the period
   * engagement→ AVG(daily_analytics."engagementRate") for the period
   */
  private async queryMetric(
    family: AlertRule['metricFamily'],
    from: Date,
    to: Date,
  ): Promise<number> {
    if (family === 'traffic') {
      const [row] = await this.dataSource.query<Array<{ val: string }>>(
        `SELECT COALESCE(SUM(sessions), 0) AS val
         FROM daily_analytics
         WHERE date >= $1 AND date < $2`,
        [from, to],
      );
      return Number(row?.val ?? 0);
    }

    if (family === 'revenue') {
      const [row] = await this.dataSource.query<Array<{ val: string }>>(
        `SELECT COALESCE(SUM("totalRevenue"), 0) AS val
         FROM daily_revenue
         WHERE date >= $1 AND date < $2`,
        [from, to],
      );
      return Number(row?.val ?? 0);
    }

    // engagement
    const [row] = await this.dataSource.query<Array<{ val: string }>>(
      `SELECT COALESCE(AVG("engagementRate"), 0) AS val
       FROM daily_analytics
       WHERE date >= $1 AND date < $2`,
      [from, to],
    );
    return Number(row?.val ?? 0);
  }

  // ---------------------------------------------------------------------------
  // Private — operator evaluation
  // ---------------------------------------------------------------------------

  private evaluate(
    operator: AlertRule['operator'],
    current: number,
    prev: number,
    threshold: number,
  ): boolean {
    switch (operator) {
      case 'gt':
        return current > threshold;
      case 'lt':
        return current < threshold;
      case 'pct_drop':
        if (prev === 0) return false; // avoid division by zero
        return ((prev - current) / prev) * 100 > threshold;
      case 'pct_rise':
        if (prev === 0) return current > 0; // any rise from zero qualifies
        return ((current - prev) / prev) * 100 > threshold;
    }
  }

  // ---------------------------------------------------------------------------
  // Private — severity derivation
  // ---------------------------------------------------------------------------

  private deriveSeverity(
    operator: AlertRule['operator'],
    threshold: number,
    current: number,
    prev: number,
  ): InsightSeverity {
    if (operator === 'pct_drop' || operator === 'lt') {
      // Drops > 50 % or absolute-low thresholds near zero → critical
      const drop =
        prev > 0 ? ((prev - current) / prev) * 100 : 0;
      if (operator === 'pct_drop' && drop > 50) return 'critical';
      if (operator === 'lt' && threshold <= 0) return 'critical';
      return 'warning';
    }
    if (operator === 'pct_rise' || operator === 'gt') {
      return 'positive';
    }
    return 'neutral';
  }

  // ---------------------------------------------------------------------------
  // Private — helpers
  // ---------------------------------------------------------------------------

  private periodBounds(timeWindow: TimeWindow): PeriodBounds {
    const now = new Date();
    // Anchor to start of today (UTC midnight)
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    let days: number;
    switch (timeWindow) {
      case '1d':  days = 1;  break;
      case '7d':  days = 7;  break;
      case '30d': days = 30; break;
    }

    const currentEnd   = new Date(today);
    const currentStart = new Date(today);
    currentStart.setUTCDate(currentStart.getUTCDate() - days);

    const prevEnd   = new Date(currentStart);
    const prevStart = new Date(currentStart);
    prevStart.setUTCDate(prevStart.getUTCDate() - days);

    return { currentStart, currentEnd, prevStart, prevEnd };
  }

  private buildSummary(rule: AlertRule, current: number, prev: number): string {
    const fmt = (n: number) => Number(n.toFixed(4)).toString();
    switch (rule.operator) {
      case 'gt':
        return `${rule.metricFamily} is ${fmt(current)}, exceeded threshold of ${rule.threshold}`;
      case 'lt':
        return `${rule.metricFamily} is ${fmt(current)}, below threshold of ${rule.threshold}`;
      case 'pct_drop': {
        const drop = prev > 0 ? (((prev - current) / prev) * 100).toFixed(1) : 'N/A';
        return `${rule.metricFamily} dropped ${drop}% (${fmt(prev)} → ${fmt(current)}), threshold ${rule.threshold}%`;
      }
      case 'pct_rise': {
        const rise = prev > 0 ? (((current - prev) / prev) * 100).toFixed(1) : 'N/A';
        return `${rule.metricFamily} rose ${rise}% (${fmt(prev)} → ${fmt(current)}), threshold ${rule.threshold}%`;
      }
    }
  }
}
