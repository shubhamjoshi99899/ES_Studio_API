import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WorkspacesService } from './workspaces.service';

@Module({
  imports: [
    JwtModule.register({}),
  ],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
