import {
  Body,
  Controller,
  Delete,
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
import { PlanGuard } from '../../../guards/plan.guard';
import { OnboardingGuard } from '../../../guards/onboarding.guard';
import { OpsAlertsService } from './ops-alerts.service';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';

@Controller('api/ops')
@ApiTags('alerts')
@UseGuards(JwtAuthGuard, OnboardingGuard, PlanGuard('alerts'))
export class OpsAlertsController {
  constructor(private readonly opsAlertsService: OpsAlertsService) {}

  @Get('alerts/rules')
  async getRules(@WorkspaceId() workspaceId: string): Promise<any> {
    return this.opsAlertsService.getRules(workspaceId);
  }

  @Post('alerts/rules')
  async createRule(
    @WorkspaceId() workspaceId: string,
    @Body() dto: CreateAlertRuleDto,
  ): Promise<any> {
    return this.opsAlertsService.createRule(workspaceId, dto);
  }

  @Patch('alerts/rules/:id')
  async updateRule(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAlertRuleDto,
  ): Promise<any> {
    return this.opsAlertsService.updateRule(workspaceId, id, dto);
  }

  @Delete('alerts/rules/:id')
  async deleteRule(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    return this.opsAlertsService.deleteRule(workspaceId, id);
  }

  @Get('alerts/insights')
  async getInsights(
    @WorkspaceId() workspaceId: string,
    @Query() query: Record<string, any>,
  ): Promise<any> {
    return this.opsAlertsService.getInsights(workspaceId, query);
  }

  @Get('notifications')
  async getNotifications(
    @WorkspaceId() workspaceId: string,
    @Query() query: Record<string, any>,
  ): Promise<any> {
    return this.opsAlertsService.getNotifications(workspaceId, query);
  }

  @Patch('notifications/:id/read')
  async markRead(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    return this.opsAlertsService.markRead(workspaceId, id);
  }

  @Post('notifications/read-all')
  async markAllRead(@WorkspaceId() workspaceId: string): Promise<any> {
    return this.opsAlertsService.markAllRead(workspaceId);
  }
}
