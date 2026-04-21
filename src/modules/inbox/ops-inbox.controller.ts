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
import { WorkspaceId } from '../../common/decorators/workspace-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlanGuard } from '../../guards/plan.guard';
import { CreateNoteDto } from './dto/create-note.dto';
import { GetThreadsQueryDto } from './dto/get-threads-query.dto';
import { SendReplyDto } from './dto/send-reply.dto';
import { UpdateThreadDto } from './dto/update-thread.dto';
import { OpsInboxService } from './ops-inbox.service';

@Controller('api/ops/inbox')
@UseGuards(JwtAuthGuard, PlanGuard('inbox'))
export class OpsInboxController {
  constructor(private readonly opsInboxService: OpsInboxService) {}

  @Get('threads')
  async getThreads(
    @WorkspaceId() workspaceId: string,
    @Query() query: GetThreadsQueryDto,
  ): Promise<any> {
    return this.opsInboxService.getThreads(workspaceId, query);
  }

  @Get('threads/:id')
  async getThread(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    return this.opsInboxService.getThread(workspaceId, id);
  }

  @Patch('threads/:id')
  async updateThread(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateThreadDto,
  ): Promise<any> {
    return this.opsInboxService.updateThread(workspaceId, id, dto);
  }

  @Get('threads/:id/messages')
  async getMessages(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    return this.opsInboxService.getMessages(workspaceId, id);
  }

  @Post('threads/:id/reply')
  async sendReply(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: SendReplyDto,
  ): Promise<any> {
    return this.opsInboxService.sendReply(workspaceId, id, dto);
  }

  @Post('threads/:id/notes')
  async createNote(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: CreateNoteDto,
  ): Promise<any> {
    return this.opsInboxService.createNote(workspaceId, id, dto);
  }

  @Get('contacts')
  async getContacts(@WorkspaceId() workspaceId: string): Promise<any> {
    return this.opsInboxService.getContacts(workspaceId);
  }

  @Get('contacts/:id')
  async getContact(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    return this.opsInboxService.getContact(workspaceId, id);
  }
}
