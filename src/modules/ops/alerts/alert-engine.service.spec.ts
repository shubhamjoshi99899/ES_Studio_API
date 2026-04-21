import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AlertEngineService } from './alert-engine.service';
import { AlertRule } from './entities/alert-rule.entity';
import { InsightCard } from './entities/insight-card.entity';
import { InAppNotification } from './entities/in-app-notification.entity';
import { Workspace } from '../../workspaces/entities/workspace.entity';
import { WorkspaceUser } from '../../workspaces/entities/workspace-user.entity';
import { MailService } from '../../../common/mail/mail.service';
import { SseNotificationGateway } from '../../../notifications/notification.gateway';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const mockRepo = () => ({
  find:   jest.fn(),
  findOne: jest.fn(),
  count:  jest.fn(),
  create: jest.fn((v: any) => v),
  save:   jest.fn(async (v: any) => ({ id: 'generated-id', ...v })),
  update: jest.fn(),
});

const WS_A = 'workspace-a-uuid';
const WS_B = 'workspace-b-uuid';

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'rule-1',
    workspaceId: WS_A,
    name: 'Test rule',
    metricFamily: 'traffic',
    operator: 'gt',
    threshold: 100,
    timeWindow: '1d',
    channels: [],
    enabled: true,
    lastEvaluated: null,
    lastTriggered: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    workspace: {} as any,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
describe('AlertEngineService', () => {
  let service: AlertEngineService;
  let ruleRepo: ReturnType<typeof mockRepo>;
  let insightRepo: ReturnType<typeof mockRepo>;
  let notifRepo: ReturnType<typeof mockRepo>;
  let workspaceRepo: ReturnType<typeof mockRepo>;
  let workspaceUserRepo: ReturnType<typeof mockRepo>;
  let mailService: { sendAlertEmail: jest.Mock };
  let dataSource: { query: jest.Mock };
  let gateway: { sendToWorkspace: jest.Mock; sendToUser: jest.Mock };

  beforeEach(async () => {
    ruleRepo         = mockRepo();
    insightRepo      = mockRepo();
    notifRepo        = mockRepo();
    workspaceRepo    = mockRepo();
    workspaceUserRepo = mockRepo();
    mailService      = { sendAlertEmail: jest.fn() };
    dataSource       = { query: jest.fn() };
    gateway          = { sendToWorkspace: jest.fn(), sendToUser: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertEngineService,
        { provide: getRepositoryToken(AlertRule),          useValue: ruleRepo },
        { provide: getRepositoryToken(InsightCard),        useValue: insightRepo },
        { provide: getRepositoryToken(InAppNotification),  useValue: notifRepo },
        { provide: getRepositoryToken(Workspace),          useValue: workspaceRepo },
        { provide: getRepositoryToken(WorkspaceUser),      useValue: workspaceUserRepo },
        { provide: MailService,              useValue: mailService },
        { provide: DataSource,               useValue: dataSource },
        { provide: 'NOTIFICATION_GATEWAY',   useValue: gateway },
      ],
    }).compile();

    service = module.get<AlertEngineService>(AlertEngineService);
  });

  afterEach(() => jest.clearAllMocks());

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Alert fires when threshold exceeded
  // ──────────────────────────────────────────────────────────────────────────
  describe('when threshold is exceeded', () => {
    beforeEach(() => {
      ruleRepo.find.mockResolvedValue([makeRule({ operator: 'gt', threshold: 100 })]);
      ruleRepo.update.mockResolvedValue(undefined);
      workspaceUserRepo.find.mockResolvedValue([]);
      // traffic metric = 200 > threshold 100
      dataSource.query.mockResolvedValue([{ val: '200' }]);
    });

    it('creates an insight_card row', async () => {
      await service.evaluateWorkspace(WS_A);
      expect(insightRepo.save).toHaveBeenCalledTimes(1);
      const saved = insightRepo.save.mock.calls[0][0];
      expect(saved.workspaceId).toBe(WS_A);
      expect(saved.severity).toBe('positive');   // gt → positive
    });

    it('creates an in_app_notification row', async () => {
      await service.evaluateWorkspace(WS_A);
      expect(notifRepo.save).toHaveBeenCalledTimes(1);
      const saved = notifRepo.save.mock.calls[0][0];
      expect(saved.workspaceId).toBe(WS_A);
      expect(saved.userId).toBeNull();           // workspace broadcast
    });

    it('emits SSE event via NOTIFICATION_GATEWAY', async () => {
      await service.evaluateWorkspace(WS_A);
      expect(gateway.sendToWorkspace).toHaveBeenCalledTimes(1);
      const [wsId, event] = gateway.sendToWorkspace.mock.calls[0];
      expect(wsId).toBe(WS_A);
      expect(event.type).toBe('alert.traffic');
    });

    it('stamps last_triggered on the rule', async () => {
      await service.evaluateWorkspace(WS_A);
      const updateCalls = ruleRepo.update.mock.calls;
      const triggeredCall = updateCalls.find(
        ([, patch]: [string, any]) => 'lastTriggered' in patch,
      );
      expect(triggeredCall).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Alert does NOT fire when threshold not exceeded
  // ──────────────────────────────────────────────────────────────────────────
  describe('when threshold is not exceeded', () => {
    beforeEach(() => {
      ruleRepo.find.mockResolvedValue([makeRule({ operator: 'gt', threshold: 100 })]);
      ruleRepo.update.mockResolvedValue(undefined);
      // traffic metric = 50 ≤ threshold 100
      dataSource.query.mockResolvedValue([{ val: '50' }]);
    });

    it('does not create insight_card or notification', async () => {
      await service.evaluateWorkspace(WS_A);
      expect(insightRepo.save).not.toHaveBeenCalled();
      expect(notifRepo.save).not.toHaveBeenCalled();
      expect(gateway.sendToWorkspace).not.toHaveBeenCalled();
    });

    it('still stamps last_evaluated', async () => {
      await service.evaluateWorkspace(WS_A);
      const updateCalls = ruleRepo.update.mock.calls;
      const evaluatedCall = updateCalls.find(
        ([, patch]: [string, any]) => 'lastEvaluated' in patch,
      );
      expect(evaluatedCall).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Cross-workspace isolation
  //    Workspace A's rule firing must NEVER create a notification in workspace B
  // ──────────────────────────────────────────────────────────────────────────
  describe('cross-workspace isolation', () => {
    it('workspace B notifications are never written when workspace A rule fires', async () => {
      ruleRepo.find
        .mockResolvedValueOnce([makeRule({ workspaceId: WS_A })])  // WS_A call
        .mockResolvedValueOnce([makeRule({ workspaceId: WS_B })]);  // WS_B call (not fired)
      ruleRepo.update.mockResolvedValue(undefined);
      workspaceUserRepo.find.mockResolvedValue([]);
      // WS_A metric fires; WS_B metric does not
      dataSource.query
        .mockResolvedValueOnce([{ val: '200' }])  // WS_A current
        .mockResolvedValueOnce([{ val: '0' }])    // WS_A prev (gt doesn't use prev)
        .mockResolvedValueOnce([{ val: '50' }])   // WS_B current
        .mockResolvedValueOnce([{ val: '0' }]);   // WS_B prev

      await service.evaluateWorkspace(WS_A);
      await service.evaluateWorkspace(WS_B);

      const allSavedNotifs: any[] = notifRepo.save.mock.calls.map((c: any[]) => c[0]);
      const wsANotifs = allSavedNotifs.filter((n) => n.workspaceId === WS_A);
      const wsBNotifs = allSavedNotifs.filter((n) => n.workspaceId === WS_B);

      expect(wsANotifs).toHaveLength(1);
      expect(wsBNotifs).toHaveLength(0);  // no notification leaked to workspace B
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. pct_drop operator math
  //    prev = 200, current = 80 → drop = (200-80)/200 * 100 = 60 %
  //    threshold = 50 → 60 > 50 → should fire
  // ──────────────────────────────────────────────────────────────────────────
  describe('pct_drop operator', () => {
    beforeEach(() => {
      ruleRepo.find.mockResolvedValue([
        makeRule({ operator: 'pct_drop', threshold: 50 }),
      ]);
      ruleRepo.update.mockResolvedValue(undefined);
      workspaceUserRepo.find.mockResolvedValue([]);
    });

    it('fires when current period dropped > threshold% vs prev period', async () => {
      // current period = 80, prev period = 200 → 60% drop > 50% threshold
      dataSource.query
        .mockResolvedValueOnce([{ val: '80' }])   // current
        .mockResolvedValueOnce([{ val: '200' }]); // prev

      await service.evaluateWorkspace(WS_A);

      expect(insightRepo.save).toHaveBeenCalledTimes(1);
      const card = insightRepo.save.mock.calls[0][0];
      expect(card.severity).toBe('critical');  // >50% drop → critical
      expect(card.payload.current).toBe(80);
      expect(card.payload.prev).toBe(200);
    });

    it('does NOT fire when drop is below threshold', async () => {
      // current = 160, prev = 200 → 20% drop < 50% threshold
      dataSource.query
        .mockResolvedValueOnce([{ val: '160' }])
        .mockResolvedValueOnce([{ val: '200' }]);

      await service.evaluateWorkspace(WS_A);

      expect(insightRepo.save).not.toHaveBeenCalled();
    });

    it('does NOT fire when prev period is 0 (avoids division by zero)', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ val: '50' }])
        .mockResolvedValueOnce([{ val: '0' }]);

      await service.evaluateWorkspace(WS_A);

      expect(insightRepo.save).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Email channel — only sends when 'email' is in channels; never throws
  // ──────────────────────────────────────────────────────────────────────────
  describe('email channel', () => {
    it('sends alert email to workspace admins when email channel is enabled', async () => {
      ruleRepo.find.mockResolvedValue([
        makeRule({ operator: 'gt', threshold: 10, channels: ['in_app', 'email'] }),
      ]);
      ruleRepo.update.mockResolvedValue(undefined);
      dataSource.query.mockResolvedValue([{ val: '500' }]);
      workspaceUserRepo.find.mockResolvedValue([
        { user: { email: 'admin@example.com' } },
        { user: { email: 'admin2@example.com' } },
      ]);

      await service.evaluateWorkspace(WS_A);

      expect(mailService.sendAlertEmail).toHaveBeenCalledTimes(2);
      expect(mailService.sendAlertEmail).toHaveBeenCalledWith(
        'admin@example.com',
        expect.any(String),
        expect.any(String),
      );
    });

    it('does not send email when email channel not configured', async () => {
      ruleRepo.find.mockResolvedValue([
        makeRule({ operator: 'gt', threshold: 10, channels: ['in_app'] }),
      ]);
      ruleRepo.update.mockResolvedValue(undefined);
      dataSource.query.mockResolvedValue([{ val: '500' }]);

      await service.evaluateWorkspace(WS_A);

      expect(mailService.sendAlertEmail).not.toHaveBeenCalled();
    });

    it('does not throw if email send fails — other side-effects still complete', async () => {
      ruleRepo.find.mockResolvedValue([
        makeRule({ operator: 'gt', threshold: 10, channels: ['email'] }),
      ]);
      ruleRepo.update.mockResolvedValue(undefined);
      dataSource.query.mockResolvedValue([{ val: '500' }]);
      workspaceUserRepo.find.mockResolvedValue([
        { user: { email: 'admin@example.com' } },
      ]);
      mailService.sendAlertEmail.mockRejectedValue(new Error('SMTP failure'));

      // Must not throw
      await expect(service.evaluateWorkspace(WS_A)).resolves.not.toThrow();
      // SSE still fires even though email failed
      expect(gateway.sendToWorkspace).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. One bad rule must not block other rules
  // ──────────────────────────────────────────────────────────────────────────
  describe('per-rule error isolation', () => {
    it('evaluates remaining rules when one rule throws', async () => {
      const badRule  = makeRule({ id: 'bad-rule',  name: 'Bad',  threshold: 10 });
      const goodRule = makeRule({ id: 'good-rule', name: 'Good', threshold: 10 });

      ruleRepo.find.mockResolvedValue([badRule, goodRule]);
      ruleRepo.update.mockResolvedValue(undefined);
      workspaceUserRepo.find.mockResolvedValue([]);

      let callCount = 0;
      dataSource.query.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error('DB error on first rule');
        return [{ val: '500' }];
      });

      await expect(service.evaluateWorkspace(WS_A)).resolves.not.toThrow();

      // Good rule still fires and creates side effects
      expect(insightRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. evaluateAll — per-workspace error isolation
  // ──────────────────────────────────────────────────────────────────────────
  describe('evaluateAll', () => {
    it('continues evaluating other workspaces when one fails', async () => {
      workspaceRepo.find.mockResolvedValue([{ id: WS_A }, { id: WS_B }]);
      // WS_A: no rules
      // WS_B: one rule that fires
      ruleRepo.find
        .mockResolvedValueOnce([])                                       // WS_A
        .mockResolvedValueOnce([makeRule({ workspaceId: WS_B })])        // WS_B
        .mockResolvedValueOnce([makeRule({ workspaceId: WS_B })]);       // count call
      ruleRepo.count.mockResolvedValue(1);
      ruleRepo.update.mockResolvedValue(undefined);
      dataSource.query.mockResolvedValue([{ val: '500' }]);
      workspaceUserRepo.find.mockResolvedValue([]);

      await expect(service.evaluateAll()).resolves.not.toThrow();
    });
  });
});

// =============================================================================
// SSE gateway — connection lifecycle and disconnect cleanup
// =============================================================================
describe('SseNotificationGateway', () => {
  let gateway: SseNotificationGateway;

  beforeEach(() => {
    gateway = new SseNotificationGateway();
  });

  function makeMockRes() {
    const listeners: Record<string, (() => void)[]> = {};
    return {
      write: jest.fn(),
      on: jest.fn((event: string, cb: () => void) => {
        listeners[event] = listeners[event] ?? [];
        listeners[event].push(cb);
      }),
      // Helper: simulate client disconnect
      disconnect: () => {
        for (const cb of listeners['close'] ?? []) cb();
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Connect → send → event received
  // ──────────────────────────────────────────────────────────────────────────
  it('SSE connect → notification sent → event received by response', async () => {
    const res = makeMockRes();
    gateway.register(WS_A, res as any);

    await gateway.sendToWorkspace(WS_A, {
      type: 'test',
      title: 'Hello',
      body: 'World',
      createdAt: new Date(),
    });

    expect(res.write).toHaveBeenCalledTimes(1);
    const written = res.write.mock.calls[0][0] as string;
    expect(written).toContain('"type":"test"');
    expect(written).toContain('"title":"Hello"');
    expect(written.startsWith('data: ')).toBe(true);
    expect(written.endsWith('\n\n')).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 9. Disconnect cleanup — connection map must be empty after close
  // ──────────────────────────────────────────────────────────────────────────
  it('disconnect removes connection from map and clears heartbeat', () => {
    jest.useFakeTimers();
    const res = makeMockRes();

    gateway.register(WS_A, res as any);
    expect(gateway.connectionCount(WS_A)).toBe(1);

    res.disconnect();

    expect(gateway.connectionCount(WS_A)).toBe(0);

    // Heartbeat must not write after disconnect
    jest.advanceTimersByTime(60_000);
    // write was not called after disconnect (only during the registration flow)
    const writesAfterDisconnect = res.write.mock.calls.length;
    expect(writesAfterDisconnect).toBe(0);  // no writes before first heartbeat tick either

    jest.useRealTimers();
  });

  it('disconnecting one client does not remove other clients for the same workspace', () => {
    const res1 = makeMockRes();
    const res2 = makeMockRes();

    gateway.register(WS_A, res1 as any);
    gateway.register(WS_A, res2 as any);
    expect(gateway.connectionCount(WS_A)).toBe(2);

    res1.disconnect();

    expect(gateway.connectionCount(WS_A)).toBe(1);
  });

  it('sendToWorkspace skips workspaces with no connections', async () => {
    await expect(
      gateway.sendToWorkspace('no-connections-ws', {
        type: 'x', title: 'x', body: 'x', createdAt: new Date(),
      }),
    ).resolves.not.toThrow();
  });
});

// =============================================================================
// PlanGuard — starter plan blocked from 'alerts' feature
// =============================================================================
import { planAllowsFeature } from '../../../guards/plan.guard';

describe('planAllowsFeature', () => {
  it('starter plan is denied access to alerts', () => {
    expect(planAllowsFeature('starter', 'alerts')).toBe(false);
  });

  it('pro plan is allowed access to alerts', () => {
    expect(planAllowsFeature('pro', 'alerts')).toBe(true);
  });

  it('enterprise plan allows everything', () => {
    expect(planAllowsFeature('enterprise', 'alerts')).toBe(true);
    expect(planAllowsFeature('enterprise', 'any_feature')).toBe(true);
  });
});
