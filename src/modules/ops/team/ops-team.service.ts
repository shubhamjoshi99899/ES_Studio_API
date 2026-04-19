import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { WorkspaceUser } from '../../workspaces/entities/workspace-user.entity';
import { WorkspaceInvite } from '../../workspaces/entities/workspace-invite.entity';
import { AuditLog } from '../../../common/audit/audit-log.entity';
import { AuditService } from '../../../common/audit/audit.service';
import { MailService } from '../../../common/mail/mail.service';
import { randomBytes } from 'crypto';

@Injectable()
export class OpsTeamService {
  constructor(
    @InjectRepository(WorkspaceUser)
    private readonly memberRepo: Repository<WorkspaceUser>,
    @InjectRepository(WorkspaceInvite)
    private readonly inviteRepo: Repository<WorkspaceInvite>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
  ) {}

  async listMembers(workspaceId: string): Promise<WorkspaceUser[]> {
    return this.memberRepo.find({ where: { workspaceId } });
  }

  async createInvite(
    workspaceId: string,
    body: { email: string; role?: WorkspaceUser['role']; actorId?: string },
  ): Promise<{ id: string; email: string; role: string; expiresAt: Date }> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 10);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invite = this.inviteRepo.create({
      workspaceId,
      email: body.email,
      role: body.role ?? 'analyst',
      token: tokenHash,
      expiresAt,
    });
    const saved = await this.inviteRepo.save(invite);

    await this.mailService.sendInvite(body.email, rawToken);

    await this.auditService.log({
      workspaceId,
      actorId: body.actorId ?? null,
      action: 'workspace.invite.create',
      entityType: 'workspace_invite',
      entityId: saved.id,
      payload: { email: body.email, role: saved.role },
    });

    return { id: saved.id, email: saved.email, role: saved.role, expiresAt: saved.expiresAt };
  }

  async updateMemberRole(
    workspaceId: string,
    memberId: string,
    body: { role: WorkspaceUser['role']; actorId?: string },
  ): Promise<WorkspaceUser> {
    if (!body.role) throw new BadRequestException('role is required');

    const member = await this.memberRepo.findOne({
      where: { id: memberId, workspaceId },
    });
    if (!member) throw new NotFoundException('Member not found in this workspace');

    const previousRole = member.role;
    member.role = body.role;
    const saved = await this.memberRepo.save(member);

    await this.auditService.log({
      workspaceId,
      actorId: body.actorId ?? null,
      action: 'workspace_user.role.update',
      entityType: 'workspace_user',
      entityId: memberId,
      payload: { previousRole, newRole: body.role },
    });

    return saved;
  }

  async getAuditLog(
    workspaceId: string,
    page: number,
    limit: number,
  ): Promise<{ data: AuditLog[]; total: number; page: number; limit: number }> {
    const safePage  = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));

    const [data, total] = await this.auditLogRepo.findAndCount({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    return { data, total, page: safePage, limit: safeLimit };
  }
}
