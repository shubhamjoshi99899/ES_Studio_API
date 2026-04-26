import { Module } from '@nestjs/common';
import { AuthModule } from '../modules/auth/auth.module';
import { SseController } from './sse.controller';
import { SseNotificationGateway } from './notification.gateway';
import { WsNotificationGateway } from './ws-notification.gateway';

@Module({
  imports: [AuthModule],
  controllers: [SseController],
  providers: [
    SseNotificationGateway,
    WsNotificationGateway,
    {
      provide: 'NOTIFICATION_GATEWAY',
      useClass: WsNotificationGateway,
    },
  ],
  // Export both the token and the concrete class so other modules can inject
  // either way (AlertEngineService uses the token; tests may inject the class).
  exports: ['NOTIFICATION_GATEWAY'],
})
export class NotificationsModule {}
