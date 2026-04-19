import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OpsScheduleController } from '../src/modules/ops/schedule/ops-schedule.controller';
import { OpsScheduleService } from '../src/modules/ops/schedule/ops-schedule.service';
import { ContentPost } from '../src/modules/ops/schedule/entities/content-post.entity';
import { ContentPostApproval } from '../src/modules/ops/schedule/entities/content-post-approval.entity';
import { AuditService } from '../src/common/audit/audit.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WS_A = 'aaaaaaaa-0000-0000-0000-000000000000';
const WS_B = 'bbbbbbbb-0000-0000-0000-000000000000';
const USER_A = 'user-aaaa-0000-0000-0000-000000000000';
const POST_ID = 'post-0000-0000-0000-000000000000';

/** Builds a JWT guard that injects a fixed user into req.user */
function mockJwtGuard(workspaceId: string, userId: string) {
  return {
    canActivate: (ctx: any) => {
      const req = ctx.switchToHttp().getRequest();
      req.user = { sub: userId, email: 'test@test.com', workspaceId };
      return true;
    },
  };
}

/** Guard that always rejects (simulates missing/invalid JWT) */
const rejectingGuard = {
  canActivate: () => false,
};

// ---------------------------------------------------------------------------
// Shared post repo mock state
// ---------------------------------------------------------------------------

function makePostStore(overrides: Partial<ContentPost> = {}): ContentPost {
  return {
    id: POST_ID,
    workspaceId: WS_A,
    title: 'Test post',
    caption: '',
    hashtags: [],
    platforms: [],
    mediaType: '',
    ownerId: USER_A,
    approvalOwner: null,
    campaignId: null,
    scheduledAt: null,
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ContentPost;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('OpsScheduleController (e2e) — state machine', () => {
  // -------------------------------------------------------------------------
  // Happy path: draft → review → approved → scheduled → published
  // -------------------------------------------------------------------------
  describe('Happy path: full lifecycle', () => {
    let app: INestApplication;
    let store: ContentPost;

    beforeAll(async () => {
      store = makePostStore();

      const postRepo = {
        create: jest.fn((data) => ({ ...store, ...data })),
        save: jest.fn(async (entity) => {
          Object.assign(store, entity);
          return store;
        }),
        find: jest.fn(async () => [store]),
        findOne: jest.fn(async ({ where }: any) => {
          if (where.workspaceId !== store.workspaceId) return null;
          if (where.id !== store.id) return null;
          return store;
        }),
        remove: jest.fn(async () => store),
      };

      const approvalRepo = {
        create: jest.fn((d) => d),
        save: jest.fn(async (d) => d),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [OpsScheduleController],
        providers: [
          OpsScheduleService,
          { provide: getRepositoryToken(ContentPost),        useValue: postRepo },
          { provide: getRepositoryToken(ContentPostApproval), useValue: approvalRepo },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          { provide: AuditService,  useValue: { log: jest.fn() } },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(mockJwtGuard(WS_A, USER_A))
        .compile();

      app = module.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ transform: true }));
      await app.init();
    });

    afterAll(() => app.close());

    it('POST /posts — creates a draft post', async () => {
      await request(app.getHttpServer())
        .post('/api/ops/schedule/posts')
        .send({ title: 'Test post', ownerId: USER_A })
        .expect(201);
      expect(store.status).toBe('draft');
    });

    it('POST /posts/:id/submit-for-review — draft → review', async () => {
      store.status = 'draft';
      const res = await request(app.getHttpServer())
        .post(`/api/ops/schedule/posts/${POST_ID}/submit-for-review`)
        .expect(201);
      expect(res.body.status).toBe('review');
    });

    it('POST /posts/:id/approve — review → approved', async () => {
      store.status = 'review';
      const res = await request(app.getHttpServer())
        .post(`/api/ops/schedule/posts/${POST_ID}/approve`)
        .expect(201);
      expect(res.body.status).toBe('approved');
    });

    it('POST /posts/:id/schedule — approved → scheduled', async () => {
      store.status = 'approved';
      const future = new Date(Date.now() + 3_600_000).toISOString();
      const res = await request(app.getHttpServer())
        .post(`/api/ops/schedule/posts/${POST_ID}/schedule`)
        .send({ scheduledAt: future })
        .expect(201);
      expect(res.body.status).toBe('scheduled');
    });

    it('GET /posts/:id — returns the post in scheduled state', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/ops/schedule/posts/${POST_ID}`)
        .expect(200);
      expect(res.body.status).toBe('scheduled');
    });
  });

  // -------------------------------------------------------------------------
  // Invalid transition: approve a draft post → 400
  // -------------------------------------------------------------------------
  describe('Invalid transition: approve a draft post', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const store = makePostStore({ status: 'draft' });

      const postRepo = {
        findOne: jest.fn(async () => store),
        save: jest.fn(async (e) => e),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [OpsScheduleController],
        providers: [
          OpsScheduleService,
          { provide: getRepositoryToken(ContentPost),         useValue: postRepo },
          { provide: getRepositoryToken(ContentPostApproval), useValue: { create: jest.fn(), save: jest.fn() } },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          { provide: AuditService,  useValue: { log: jest.fn() } },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(mockJwtGuard(WS_A, USER_A))
        .compile();

      app = module.createNestApplication();
      await app.init();
    });

    afterAll(() => app.close());

    it('returns 400 when approving a draft post', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/ops/schedule/posts/${POST_ID}/approve`)
        .expect(400);
      expect(res.body.message).toMatch(/Invalid transition/);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-workspace isolation: post from WS_A not accessible from WS_B → 404
  // -------------------------------------------------------------------------
  describe('Cross-workspace isolation', () => {
    let app: INestApplication;

    beforeAll(async () => {
      // Repo only knows about WS_A's post
      const store = makePostStore({ workspaceId: WS_A });

      const postRepo = {
        findOne: jest.fn(async ({ where }: any) => {
          // Enforce workspace isolation at the query level
          if (where.workspaceId !== store.workspaceId) return null;
          if (where.id !== store.id) return null;
          return store;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [OpsScheduleController],
        providers: [
          OpsScheduleService,
          { provide: getRepositoryToken(ContentPost),         useValue: postRepo },
          { provide: getRepositoryToken(ContentPostApproval), useValue: {} },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          { provide: AuditService,  useValue: { log: jest.fn() } },
        ],
      })
        // Authenticated as workspace B
        .overrideGuard(JwtAuthGuard)
        .useValue(mockJwtGuard(WS_B, 'user-bbbb'))
        .compile();

      app = module.createNestApplication();
      await app.init();
    });

    afterAll(() => app.close());

    it('returns 404 when workspace B reads workspace A post', async () => {
      await request(app.getHttpServer())
        .get(`/api/ops/schedule/posts/${POST_ID}`)
        .expect(404);
    });

    it('returns 404 when workspace B tries to transition workspace A post', async () => {
      await request(app.getHttpServer())
        .post(`/api/ops/schedule/posts/${POST_ID}/submit-for-review`)
        .expect(404);
    });
  });

  // -------------------------------------------------------------------------
  // Missing workspaceId in JWT → 401
  // -------------------------------------------------------------------------
  describe('Missing workspaceId in JWT', () => {
    let app: INestApplication;

    beforeAll(async () => {
      // Guard injects a user with no workspaceId
      const noWorkspaceGuard = {
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = { sub: USER_A, email: 'x@x.com' };
          return true;
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [OpsScheduleController],
        providers: [
          OpsScheduleService,
          { provide: getRepositoryToken(ContentPost),         useValue: {} },
          { provide: getRepositoryToken(ContentPostApproval), useValue: {} },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          { provide: AuditService,  useValue: { log: jest.fn() } },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(noWorkspaceGuard)
        .compile();

      app = module.createNestApplication();
      await app.init();
    });

    afterAll(() => app.close());

    it('returns 401 when workspaceId is absent from JWT', async () => {
      await request(app.getHttpServer())
        .get('/api/ops/schedule/posts')
        .expect(401);
    });
  });
});
