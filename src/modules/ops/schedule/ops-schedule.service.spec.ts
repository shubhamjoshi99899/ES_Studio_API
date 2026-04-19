import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OpsScheduleService } from './ops-schedule.service';
import { ContentPost } from './entities/content-post.entity';
import { ContentPostApproval } from './entities/content-post-approval.entity';
import { AuditService } from '../../../common/audit/audit.service';

const mockRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
});

describe('OpsScheduleService', () => {
  let service: OpsScheduleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpsScheduleService,
        { provide: getRepositoryToken(ContentPost),        useFactory: mockRepo },
        { provide: getRepositoryToken(ContentPostApproval), useFactory: mockRepo },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: AuditService,  useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<OpsScheduleService>(OpsScheduleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it.todo('createPost creates a workspace-scoped scheduled post');
  it.todo('listPosts returns workspace-scoped scheduled posts');
  it.todo('getPost returns a workspace-scoped scheduled post');
  it.todo('updatePost updates a workspace-scoped scheduled post');
  it.todo('deletePost deletes a workspace-scoped scheduled post');
  it.todo('submitForReview transitions a workspace-scoped post to review');
  it.todo('approvePost approves a workspace-scoped post');
  it.todo('rejectPost rejects a workspace-scoped post');
  it.todo('schedulePost schedules a workspace-scoped post');
});
