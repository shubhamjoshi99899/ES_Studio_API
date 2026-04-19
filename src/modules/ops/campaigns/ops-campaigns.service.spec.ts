import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OpsCampaignsService } from './ops-campaigns.service';
import { Campaign } from './entities/campaign.entity';
import { CampaignPostLink } from './entities/campaign-post-link.entity';
import { ContentPost } from '../schedule/entities/content-post.entity';
import { AuditService } from '../../../common/audit/audit.service';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
});

describe('OpsCampaignsService', () => {
  let service: OpsCampaignsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpsCampaignsService,
        { provide: getRepositoryToken(Campaign),         useFactory: mockRepo },
        { provide: getRepositoryToken(CampaignPostLink), useFactory: mockRepo },
        { provide: getRepositoryToken(ContentPost),      useFactory: mockRepo },
        { provide: AuditService, useValue: { log: jest.fn() } },
        {
          provide: DataSource,
          useValue: {
            query: jest.fn().mockResolvedValue([
              { total_posts: 0, published_posts: 0, total_reach: 0, total_revenue: 0 },
            ]),
          },
        },
      ],
    }).compile();

    service = module.get<OpsCampaignsService>(OpsCampaignsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it.todo('createCampaign creates a workspace-scoped campaign');
  it.todo('listCampaigns returns workspace-scoped campaigns');
  it.todo('getCampaign returns a workspace-scoped campaign');
  it.todo('updateCampaign updates a workspace-scoped campaign');
  it.todo('deleteCampaign deletes a workspace-scoped campaign');
  it.todo('linkPost links a workspace-scoped post to a workspace-scoped campaign');
  it.todo('unlinkPost unlinks a workspace-scoped post from a workspace-scoped campaign');
});
