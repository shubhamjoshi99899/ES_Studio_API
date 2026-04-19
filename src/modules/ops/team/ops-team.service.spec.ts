import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OpsTeamService } from './ops-team.service';
import { WorkspaceUser } from '../../workspaces/entities/workspace-user.entity';
import { WorkspaceInvite } from '../../workspaces/entities/workspace-invite.entity';
import { AuditLog } from '../../../common/audit/audit-log.entity';
import { AuditService } from '../../../common/audit/audit.service';
import { MailService } from '../../../common/mail/mail.service';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

describe('OpsTeamService', () => {
  let service: OpsTeamService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpsTeamService,
        { provide: getRepositoryToken(WorkspaceUser),  useFactory: mockRepo },
        { provide: getRepositoryToken(WorkspaceInvite), useFactory: mockRepo },
        { provide: getRepositoryToken(AuditLog),       useFactory: mockRepo },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: MailService,  useValue: { sendInvite: jest.fn() } },
      ],
    }).compile();

    service = module.get<OpsTeamService>(OpsTeamService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it.todo('listMembers returns workspace-scoped members');
  it.todo('createInvite creates a workspace-scoped invite');
  it.todo('updateMemberRole updates the role for a workspace-scoped member');
  it.todo('getAuditLog returns workspace-scoped audit log entries');
});
