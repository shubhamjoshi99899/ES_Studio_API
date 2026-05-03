import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WorkspaceId } from '../../../common/decorators/workspace-id.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { OnboardingGuard } from '../../../guards/onboarding.guard';
import { OpsCampaignsService } from './ops-campaigns.service';

@Controller('api/ops/campaigns')
@ApiTags('campaigns')
@UseGuards(JwtAuthGuard, OnboardingGuard)
export class OpsCampaignsController {
  constructor(private readonly opsCampaignsService: OpsCampaignsService) {}

  @Post()
  async createCampaign(
    @WorkspaceId() workspaceId: string,
    @Body() body: any,
  ): Promise<any> {
    return this.opsCampaignsService.createCampaign(workspaceId, body);
  }

  @Get()
  async listCampaigns(@WorkspaceId() workspaceId: string): Promise<any> {
    return this.opsCampaignsService.listCampaigns(workspaceId);
  }

  @Get(':id')
  async getCampaign(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    return this.opsCampaignsService.getCampaign(workspaceId, id);
  }

  @Patch(':id')
  async updateCampaign(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() body: any,
  ): Promise<any> {
    return this.opsCampaignsService.updateCampaign(workspaceId, id, body);
  }

  @Delete(':id')
  async deleteCampaign(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    return this.opsCampaignsService.deleteCampaign(workspaceId, id);
  }

  @Post(':id/posts/:postId')
  async linkPost(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Param('postId') postId: string,
  ): Promise<any> {
    return this.opsCampaignsService.linkPost(workspaceId, id, postId);
  }

  @Delete(':id/posts/:postId')
  async unlinkPost(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Param('postId') postId: string,
  ): Promise<any> {
    return this.opsCampaignsService.unlinkPost(workspaceId, id, postId);
  }
}
