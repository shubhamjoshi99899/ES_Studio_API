import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere } from 'typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import type { IPlatformInboxAdapter } from './adapters/platform-adapter.interface';
import { InboxContact } from './entities/inbox-contact.entity';
import { InboxMessage } from './entities/inbox-message.entity';
import { InboxNote } from './entities/inbox-note.entity';
import { InboxThread } from './entities/inbox-thread.entity';
import { CreateNoteDto } from './dto/create-note.dto';
import { GetThreadsQueryDto } from './dto/get-threads-query.dto';
import { SendReplyDto } from './dto/send-reply.dto';
import { UpdateThreadDto } from './dto/update-thread.dto';

@Injectable()
export class OpsInboxService {
  constructor(
    @InjectRepository(InboxThread)
    private readonly threadRepo: Repository<InboxThread>,
    @InjectRepository(InboxMessage)
    private readonly messageRepo: Repository<InboxMessage>,
    @InjectRepository(InboxContact)
    private readonly contactRepo: Repository<InboxContact>,
    @InjectRepository(InboxNote)
    private readonly noteRepo: Repository<InboxNote>,
    private readonly auditService: AuditService,
    @Inject('INBOX_ADAPTERS')
    private readonly inboxAdapters: IPlatformInboxAdapter[],
  ) {}

  async getThreads(
    workspaceId: string,
    query: GetThreadsQueryDto,
  ): Promise<{ data: InboxThread[]; total: number; page: number; limit: number }> {
    const where: FindOptionsWhere<InboxThread> = { workspaceId };

    if (query.status) where.status = query.status;
    if (query.platform) where.platform = query.platform;

    const [data, total] = await this.threadRepo.findAndCount({
      where,
      relations: ['contact', 'assignedToUser'],
      order: { lastMessageAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return {
      data,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async getThread(workspaceId: string, threadId: string): Promise<InboxThread> {
    return this.getThreadOrFail(workspaceId, threadId);
  }

  async updateThread(
    workspaceId: string,
    threadId: string,
    dto: UpdateThreadDto,
  ): Promise<InboxThread> {
    const thread = await this.getThreadOrFail(workspaceId, threadId);

    Object.assign(thread, dto);
    const saved = await this.threadRepo.save(thread);

    await this.auditService.log({
      workspaceId,
      actorId: null,
      action: 'inbox_thread.update',
      entityType: 'inbox_thread',
      entityId: saved.id,
      payload: { ...dto },
    });

    return saved;
  }

  async getMessages(workspaceId: string, threadId: string): Promise<InboxMessage[]> {
    await this.getThreadOrFail(workspaceId, threadId);

    return this.messageRepo.find({
      where: { workspaceId, threadId },
      order: { createdAt: 'ASC' },
    });
  }

  async sendReply(
    workspaceId: string,
    threadId: string,
    dto: SendReplyDto,
  ): Promise<InboxMessage> {
    const thread = await this.getThreadOrFail(workspaceId, threadId);

    const pendingMessage = this.messageRepo.create({
      workspaceId,
      threadId: thread.id,
      externalMessageId: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      direction: 'outbound',
      body: dto.body,
      mediaUrls: null,
      senderExternalId: 'workspace',
      senderName: null,
      readAt: null,
    });
    const savedPendingMessage = await this.messageRepo.save(pendingMessage);

    const adapter = this.inboxAdapters.find((item) => item.platform === thread.platform);
    if (!adapter) {
      throw new NotFoundException(
        `Inbox adapter not found for platform ${thread.platform}`,
      );
    }

    const result = await adapter.sendReply(thread.externalThreadId, dto.body);

    savedPendingMessage.externalMessageId = result.externalMessageId;
    const saved = await this.messageRepo.save(savedPendingMessage);

    await this.auditService.log({
      workspaceId,
      actorId: null,
      action: 'inbox_message.reply',
      entityType: 'inbox_message',
      entityId: saved.id,
      payload: { threadId: thread.id, body: dto.body },
    });

    return saved;
  }

  async createNote(
    workspaceId: string,
    threadId: string,
    dto: CreateNoteDto,
  ): Promise<Partial<InboxNote>> {
    const thread = await this.getThreadOrFail(workspaceId, threadId);

    const note = this.noteRepo.create({
      workspaceId,
      threadId: thread.id,
      body: dto.body,
    } as Partial<InboxNote>);

    await this.auditService.log({
      workspaceId,
      actorId: null,
      action: 'inbox_note.create',
      entityType: 'inbox_note',
      entityId: null,
      payload: { threadId: thread.id, body: dto.body },
    });

    return note;
  }

  async getContacts(workspaceId: string): Promise<InboxContact[]> {
    return this.contactRepo.find({
      where: { workspaceId },
      order: { updatedAt: 'DESC' },
    });
  }

  async getContact(workspaceId: string, contactId: string): Promise<InboxContact> {
    const contact = await this.contactRepo.findOne({
      where: { id: contactId, workspaceId },
    });

    if (!contact) {
      throw new NotFoundException('Inbox contact not found');
    }

    return contact;
  }

  private async getThreadOrFail(
    workspaceId: string,
    threadId: string,
  ): Promise<InboxThread> {
    const thread = await this.threadRepo.findOne({
      where: { id: threadId, workspaceId },
      relations: ['contact', 'assignedToUser'],
    });

    if (!thread) {
      throw new NotFoundException('Inbox thread not found');
    }

    return thread;
  }
}
