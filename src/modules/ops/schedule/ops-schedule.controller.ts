import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { WorkspaceId } from '../../../common/decorators/workspace-id.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { OnboardingGuard } from '../../../guards/onboarding.guard';
import { OpsScheduleService } from './ops-schedule.service';

@Controller('api/ops/schedule')
@ApiTags('schedule')
@UseGuards(JwtAuthGuard, OnboardingGuard)
export class OpsScheduleController {
  constructor(private readonly opsScheduleService: OpsScheduleService) {}

  @Post('posts')
  async createPost(
    @WorkspaceId() workspaceId: string,
    @Body() body: any,
  ): Promise<any> {
    return this.opsScheduleService.createPost(workspaceId, body);
  }

  @Get('posts')
  async listPosts(@WorkspaceId() workspaceId: string): Promise<any> {
    return this.opsScheduleService.listPosts(workspaceId);
  }

  @Get('posts/:id')
  async getPost(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    return this.opsScheduleService.getPost(workspaceId, id);
  }

  @Patch('posts/:id')
  async updatePost(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() body: any,
  ): Promise<any> {
    return this.opsScheduleService.updatePost(workspaceId, id, body);
  }

  @Delete('posts/:id')
  async deletePost(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    return this.opsScheduleService.deletePost(workspaceId, id);
  }

  @Post('posts/:id/submit-for-review')
  async submitForReview(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<any> {
    const triggeredBy = (req['user'] as any)?.sub ?? workspaceId;
    return this.opsScheduleService.submitForReview(workspaceId, id, triggeredBy);
  }

  @Post('posts/:id/approve')
  async approvePost(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
  ): Promise<any> {
    const triggeredBy = (req['user'] as any)?.sub ?? workspaceId;
    return this.opsScheduleService.approvePost(
      workspaceId,
      id,
      triggeredBy,
      body?.reviewerId,
      body?.note,
    );
  }

  @Post('posts/:id/reject')
  async rejectPost(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
  ): Promise<any> {
    const triggeredBy = (req['user'] as any)?.sub ?? workspaceId;
    return this.opsScheduleService.rejectPost(workspaceId, id, {
      ...body,
      triggeredBy,
    });
  }

  @Post('posts/:id/schedule')
  async schedulePost(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
  ): Promise<any> {
    const triggeredBy = (req['user'] as any)?.sub ?? workspaceId;
    return this.opsScheduleService.schedulePost(workspaceId, id, {
      ...body,
      triggeredBy,
    });
  }
}
