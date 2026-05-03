import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OpsConnectionsController } from './ops-connections.controller';
import { OpsConnectionsService } from './ops-connections.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [OpsConnectionsController],
  providers: [OpsConnectionsService],
})
export class OpsConnectionsModule {}
