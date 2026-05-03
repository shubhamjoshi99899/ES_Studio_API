import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WorkspaceId } from '../../../common/decorators/workspace-id.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { OnboardingGuard } from '../../../guards/onboarding.guard';
import { OpsTeamService } from './ops-team.service';

@Controller('api/ops/team')
@ApiTags('team')
@UseGuards(JwtAuthGuard, OnboardingGuard)
export class OpsTeamController {
  constructor(private readonly opsTeamService: OpsTeamService) {}

  @Get('members')
  async listMembers(@WorkspaceId() workspaceId: string): Promise<any> {
    return this.opsTeamService.listMembers(workspaceId);
  }

  @Post('invites')
  async createInvite(
    @WorkspaceId() workspaceId: string,
    @Body() body: any,
  ): Promise<any> {
    return this.opsTeamService.createInvite(workspaceId, body);
  }

  @Patch('members/:id/role')
  async updateMemberRole(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() body: any,
  ): Promise<any> {
    return this.opsTeamService.updateMemberRole(workspaceId, id, body);
  }

  @Get('audit-log')
  async getAuditLog(
    @WorkspaceId() workspaceId: string,
    @Query('page')  page  = '1',
    @Query('limit') limit = '20',
  ): Promise<any> {
    return this.opsTeamService.getAuditLog(
      workspaceId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }
}
