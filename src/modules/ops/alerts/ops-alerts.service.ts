import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { AuditService } from '../../../common/audit/audit.service';
import { AlertRule } from './entities/alert-rule.entity';
import { InsightCard } from './entities/insight-card.entity';
import { InAppNotification } from './entities/in-app-notification.entity';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';

@Injectable()
export class OpsAlertsService {
  constructor(
    @InjectRepository(AlertRule)
    private readonly ruleRepo: Repository<AlertRule>,
    @InjectRepository(InsightCard)
    private readonly insightRepo: Repository<InsightCard>,
    @InjectRepository(InAppNotification)
    private readonly notificationRepo: Repository<InAppNotification>,
    private readonly auditService: AuditService,
  ) {}

  async getRules(workspaceId: string): Promise<AlertRule[]> {
    return this.ruleRepo.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  async createRule(
    workspaceId: string,
    dto: CreateAlertRuleDto,
  ): Promise<AlertRule> {
    const rule = this.ruleRepo.create({
      workspaceId,
      ...dto,
    });
    const saved = await this.ruleRepo.save(rule);

    await this.auditService.log({
      workspaceId,
      actorId: null,
      action: 'alert_rule.create',
      entityType: 'alert_rule',
      entityId: saved.id,
      payload: { ...dto },
    });

    return saved;
  }

  async updateRule(
    workspaceId: string,
    id: string,
    dto: UpdateAlertRuleDto,
  ): Promise<AlertRule> {
    const rule = await this.ruleRepo.findOne({
      where: { id, workspaceId },
    });
    if (!rule) throw new NotFoundException('Alert rule not found');

    Object.assign(rule, dto);
    const saved = await this.ruleRepo.save(rule);

    await this.auditService.log({
      workspaceId,
      actorId: null,
      action: 'alert_rule.update',
      entityType: 'alert_rule',
      entityId: saved.id,
      payload: { ...dto },
    });

    return saved;
  }

  async deleteRule(workspaceId: string, id: string): Promise<void> {
    const rule = await this.ruleRepo.findOne({
      where: { id, workspaceId },
    });
    if (!rule) throw new NotFoundException('Alert rule not found');

    await this.ruleRepo.remove(rule);

    await this.auditService.log({
      workspaceId,
      actorId: null,
      action: 'alert_rule.delete',
      entityType: 'alert_rule',
      entityId: id,
      payload: {},
    });
  }

  async getInsights(
    workspaceId: string,
    query: Record<string, any>,
  ): Promise<{ data: InsightCard[]; total: number; page: number; limit: number }> {
    const page = this.parsePage(query.page);
    const limit = this.parseLimit(query.limit);

    const [data, total] = await this.insightRepo.findAndCount({
      where: {
        workspaceId,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async getNotifications(
    workspaceId: string,
    query: Record<string, any>,
  ): Promise<{ data: InAppNotification[]; total: number; page: number; limit: number }> {
    const page = this.parsePage(query.page);
    const limit = this.parseLimit(query.limit);
    const unread = query.unread === 'true' || query.unread === true;

    const where = unread
      ? { workspaceId, readAt: IsNull() }
      : { workspaceId };

    const [data, total] = await this.notificationRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async markRead(workspaceId: string, id: string): Promise<InAppNotification> {
    const notification = await this.notificationRepo.findOne({
      where: { id, workspaceId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    notification.readAt = notification.readAt ?? new Date();
    const saved = await this.notificationRepo.save(notification);

    await this.auditService.log({
      workspaceId,
      actorId: null,
      action: 'in_app_notification.read',
      entityType: 'in_app_notification',
      entityId: saved.id,
      payload: { readAt: saved.readAt?.toISOString() ?? null },
    });

    return saved;
  }

  async markAllRead(workspaceId: string): Promise<{ updated: number }> {
    const readAt = new Date();
    const result = await this.notificationRepo.update(
      { workspaceId, readAt: IsNull() },
      { readAt },
    );

    await this.auditService.log({
      workspaceId,
      actorId: null,
      action: 'in_app_notification.read_all',
      entityType: 'in_app_notification',
      entityId: null,
      payload: { updated: result.affected ?? 0 },
    });

    return { updated: result.affected ?? 0 };
  }

  private parsePage(value: unknown): number {
    const page = Number.parseInt(String(value ?? '1'), 10);
    return Number.isNaN(page) ? 1 : Math.max(1, page);
  }

  private parseLimit(value: unknown): number {
    const limit = Number.parseInt(String(value ?? '20'), 10);
    if (Number.isNaN(limit)) return 20;
    return Math.min(100, Math.max(1, limit));
  }
}
