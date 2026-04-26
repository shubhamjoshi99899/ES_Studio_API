import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { DataSource } from 'typeorm';

import { InboxPollProcessor } from './inbox-poll.processor';
import { InboxService } from './inbox.service';
import { InboxContact } from './entities/inbox-contact.entity';
import { InboxThread } from './entities/inbox-thread.entity';
import { InboxMessage } from './entities/inbox-message.entity';
import { PlatformConnection } from './entities/platform-connection.entity';
import { LinkedInAdapter } from './adapters/linkedin.adapter';
import type { IPlatformInboxAdapter, InboxThread as AdapterThread } from './adapters/platform-adapter.interface';

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockRepo = () => ({
  find:   jest.fn(),
  findOne: jest.fn(),
  create: jest.fn((v: any) => v),
  save:   jest.fn(async (v: any) => ({ id: 'generated-id', ...v })),
  update: jest.fn(),
});

const WS_A = 'workspace-a-uuid';
const WS_B = 'workspace-b-uuid';
const PROFILE_A = 'fb-page-id-001';

function makeAdapterThread(overrides: Partial<AdapterThread> = {}): AdapterThread {
  return {
    externalThreadId:  'thread-001',
    externalProfileId: PROFILE_A,
    contact: { externalId: 'user-ext-001', name: 'Alice' },
    messages: [
      {
        externalThreadId:  'thread-001',
        externalMessageId: 'msg-001',
        direction:         'inbound',
        body:              'Hello!',
        senderExternalId:  'user-ext-001',
        senderName:        'Alice',
        sentAt:            new Date('2026-04-01T10:00:00Z'),
      },
    ],
    lastMessageAt: new Date('2026-04-01T10:00:00Z'),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('InboxPollProcessor', () => {
  let processor: InboxPollProcessor;
  let inboxService: { getAdapter: jest.Mock };
  let mockAdapter: jest.Mocked<IPlatformInboxAdapter>;
  let dataSource: { query: jest.Mock };
  let connectionRepo: ReturnType<typeof mockRepo>;
  let gateway: { sendToWorkspace: jest.Mock; sendToUser: jest.Mock };

  beforeEach(async () => {
    mockAdapter = {
      platform:     'facebook',
      fetchThreads: jest.fn(),
      fetchMessages: jest.fn(),
      sendReply:    jest.fn(),
      markAsRead:   jest.fn(),
    };

    inboxService = { getAdapter: jest.fn().mockReturnValue(mockAdapter) };

    connectionRepo = {
      ...mockRepo(),
      find: jest.fn().mockResolvedValue([
        {
          id: 'conn-1',
          workspaceId: WS_A,
          platform: 'facebook',
          externalProfileId: PROFILE_A,
          accessToken: 'tok-abc',
          status: 'active',
          lastSyncedAt: null,
        },
      ]),
    };

    // DataSource.query is used for raw upserts — track calls & return sensible data
    dataSource = {
      query: jest.fn().mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes('SELECT id FROM inbox_contacts')) {
          return Promise.resolve([{ id: 'contact-uuid' }]);
        }
        if (sql.includes('SELECT id FROM inbox_threads')) {
          return Promise.resolve([{ id: 'thread-uuid' }]);
        }
        if (sql.includes('INSERT INTO inbox_messages')) {
          // params[3] is direction ($4 in the SQL)
          return Promise.resolve([{ id: 'msg-uuid', direction: params?.[3] ?? 'inbound', read_at: null }]);
        }
        return Promise.resolve([]);
      }),
    };

    gateway = { sendToWorkspace: jest.fn(), sendToUser: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InboxPollProcessor,
        { provide: InboxService,                             useValue: inboxService },
        { provide: DataSource,                               useValue: dataSource },
        { provide: getRepositoryToken(InboxContact),        useValue: mockRepo() },
        { provide: getRepositoryToken(InboxThread),         useValue: mockRepo() },
        { provide: getRepositoryToken(InboxMessage),        useValue: mockRepo() },
        { provide: getRepositoryToken(PlatformConnection),  useValue: connectionRepo },
        { provide: getQueueToken('inbox-poll'),             useValue: { add: jest.fn() } },
        { provide: 'NOTIFICATION_GATEWAY',                  useValue: gateway },
      ],
    }).compile();

    processor = module.get(InboxPollProcessor);
  });

  // ── Poll job: Meta adapter returns 2 threads ────────────────────────────

  it('creates inbox_threads + inbox_messages from 2 fetched threads', async () => {
    const threads = [
      makeAdapterThread({ externalThreadId: 'thread-001' }),
      makeAdapterThread({
        externalThreadId: 'thread-002',
        contact: { externalId: 'user-ext-002', name: 'Bob' },
        messages: [
          {
            externalThreadId:  'thread-002',
            externalMessageId: 'msg-002',
            direction:         'inbound',
            body:              'Hi there',
            senderExternalId:  'user-ext-002',
            sentAt:            new Date(),
          },
        ],
      }),
    ];
    mockAdapter.fetchThreads.mockResolvedValue(threads);

    await processor.handlePoll({ data: { workspaceId: WS_A, profileId: PROFILE_A, platform: 'facebook', since: new Date() } } as any);

    // One upsert per thread (contacts + threads) + one INSERT per message
    const contactInserts = (dataSource.query.mock.calls as any[][]).filter(([sql]) =>
      sql.includes('INSERT INTO inbox_contacts'),
    );
    const threadInserts = (dataSource.query.mock.calls as any[][]).filter(([sql]) =>
      sql.includes('INSERT INTO inbox_threads'),
    );
    const messageInserts = (dataSource.query.mock.calls as any[][]).filter(([sql]) =>
      sql.includes('INSERT INTO inbox_messages'),
    );

    expect(contactInserts).toHaveLength(2);
    expect(threadInserts).toHaveLength(2);
    expect(messageInserts).toHaveLength(2);
  });

  // ── InAppNotification emitted for new inbound messages ─────────────────

  it('emits InAppNotification for newly inserted inbound messages', async () => {
    mockAdapter.fetchThreads.mockResolvedValue([makeAdapterThread()]);

    await processor.handlePoll({ data: { workspaceId: WS_A, profileId: PROFILE_A, platform: 'facebook', since: new Date() } } as any);

    expect(gateway.sendToWorkspace).toHaveBeenCalledWith(
      WS_A,
      expect.objectContaining({ type: 'inbox.new_messages' }),
    );
  });

  // ── Duplicate poll: same externalMessageId → no duplicate rows ──────────

  it('does not insert duplicate rows on second poll of the same message', async () => {
    // First poll
    mockAdapter.fetchThreads.mockResolvedValue([makeAdapterThread()]);
    await processor.handlePoll({ data: { workspaceId: WS_A, profileId: PROFILE_A, platform: 'facebook', since: new Date() } } as any);

    const firstCallCount = dataSource.query.mock.calls.length;
    dataSource.query.mockClear();
    gateway.sendToWorkspace.mockClear(); // reset so "not.toHaveBeenCalled" checks only the 2nd poll

    // Second poll — message INSERT uses ON CONFLICT DO NOTHING, returns []
    dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM inbox_contacts')) return Promise.resolve([{ id: 'contact-uuid' }]);
      if (sql.includes('SELECT id FROM inbox_threads'))  return Promise.resolve([{ id: 'thread-uuid' }]);
      if (sql.includes('INSERT INTO inbox_messages'))    return Promise.resolve([]); // no new row
      return Promise.resolve([]);
    });

    mockAdapter.fetchThreads.mockResolvedValue([makeAdapterThread()]);
    await processor.handlePoll({ data: { workspaceId: WS_A, profileId: PROFILE_A, platform: 'facebook', since: new Date() } } as any);

    // Notification should NOT be emitted when no new messages were inserted
    expect(gateway.sendToWorkspace).not.toHaveBeenCalled();
  });

  // ── Cross-workspace isolation ───────────────────────────────────────────

  it('only writes threads to the workspace in the job payload (WS_A)', async () => {
    mockAdapter.fetchThreads.mockResolvedValue([makeAdapterThread()]);

    await processor.handlePoll({ data: { workspaceId: WS_A, profileId: PROFILE_A, platform: 'facebook', since: new Date() } } as any);

    const threadInserts = (dataSource.query.mock.calls as any[][]).filter(([sql]) =>
      sql.includes('INSERT INTO inbox_threads'),
    );
    // Every thread insert should carry WS_A, not WS_B
    for (const [, params] of threadInserts) {
      expect(params[0]).toBe(WS_A);
      expect(params[0]).not.toBe(WS_B);
    }
  });

  // ── sendReply: calls adapter.sendReply(), produces outbound message ─────

  it('calls adapter.sendReply and returns externalMessageId', async () => {
    mockAdapter.sendReply.mockResolvedValue({ externalMessageId: 'reply-msg-001' });

    const adapter = inboxService.getAdapter('facebook');
    const result = await adapter.sendReply('thread-001', 'Thanks!');

    expect(mockAdapter.sendReply).toHaveBeenCalledWith('thread-001', 'Thanks!');
    expect(result.externalMessageId).toBe('reply-msg-001');
  });

  // ── LinkedIn adapter Phase 4 — throws PlatformAuthException when no connection row ──

  it('LinkedIn adapter throws PlatformAuthException on fetchThreads when no connection exists', async () => {
    const mockDs = { query: jest.fn().mockResolvedValue([]) } as unknown as DataSource;
    const li = new LinkedInAdapter(mockDs);
    await expect(li.fetchThreads('profile-123', new Date())).rejects.toThrow(
      'No active LinkedIn connection for profile profile-123',
    );
  });

  it('LinkedIn adapter throws PlatformAuthException on sendReply when no connection exists', async () => {
    const mockDs = { query: jest.fn().mockResolvedValue([]) } as unknown as DataSource;
    const li = new LinkedInAdapter(mockDs);
    await expect(li.sendReply('thread-123', 'hello')).rejects.toThrow(
      'No active LinkedIn connection',
    );
  });
});
