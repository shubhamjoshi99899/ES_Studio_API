import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { WorkspaceId } from '../../../common/decorators/workspace-id.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { OpsConnectionsService } from './ops-connections.service';

@Controller('api/ops/connections')
@ApiTags('connections')
@UseGuards(JwtAuthGuard)
export class OpsConnectionsController {
  constructor(
    private readonly opsConnectionsService: OpsConnectionsService,
  ) {}

  @Get()
  async getConnections(@WorkspaceId() workspaceId: string): Promise<any> {
    return this.opsConnectionsService.getConnections(workspaceId);
  }

  @Delete(':id')
  @HttpCode(204)
  async disconnect(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.opsConnectionsService.disconnect(workspaceId, id);
  }

  @Get('oauth/start')
  async getOAuthStartUrl(
    @WorkspaceId() workspaceId: string,
    @Query('platform') platform: string,
  ): Promise<{ authUrl: string }> {
    return this.opsConnectionsService.getOAuthUrl(workspaceId, platform);
  }

  // TASK 3d: return candidate list for the workspace
  @Get('candidates')
  async getCandidates(
    @WorkspaceId() workspaceId: string,
    @Query('token') token: string,
  ): Promise<any> {
    return this.opsConnectionsService.getCandidates(workspaceId, token);
  }

  // TASK 3e: connect only the chosen profiles and clear Redis key
  @Post('confirm')
  async confirmCandidates(
    @WorkspaceId() workspaceId: string,
    @Body() body: { token: string; selectedProfileIds: string[] },
  ): Promise<{ connected: number }> {
    return this.opsConnectionsService.confirmCandidates(
      workspaceId,
      body.token,
      body.selectedProfileIds,
    );
  }

  // TASK 1: catch all errors and redirect with an error code; never let a 500 escape
  @Public()
  @Get('oauth/callback')
  async handleOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl =
      process.env.FRONTEND_URL ?? process.env.APP_URL ?? 'http://localhost:3000';

    try {
      const result = await this.opsConnectionsService.handleCallback(code, state);

      if (result.candidateToken) {
        // TASK 3c: Meta platforms — redirect to profile selection page
        res.redirect(
          302,
          `${frontendUrl}/settings/connections/select` +
            `?token=${encodeURIComponent(result.candidateToken)}` +
            `&platform=${encodeURIComponent(result.platform)}`,
        );
      } else {
        res.redirect(
          302,
          `${frontendUrl}/settings/connections` +
            `?connected=${encodeURIComponent(result.platform)}` +
            `&count=${encodeURIComponent(String(result.connected ?? 1))}`,
        );
      }
    } catch (error: unknown) {
      res.redirect(302, `${frontendUrl}/settings/connections?error=${this.toErrorCode(error)}`);
    }
  }

  private toErrorCode(error: unknown): string {
    if (error instanceof NotFoundException) return 'workspace_not_found';
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      const msg = typeof response === 'string' ? response : (response as any)?.message;
      if (msg === 'oauth_state_mismatch' || msg === 'token_exchange_failed') return msg;
      return 'token_exchange_failed';
    }
    return 'unknown';
  }
}
