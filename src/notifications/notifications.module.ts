import { Module } from '@nestjs/common';
import { SseController } from './sse.controller';
import { SseNotificationGateway } from './notification.gateway';

@Module({
  controllers: [SseController],
  providers: [
    {
      provide: 'NOTIFICATION_GATEWAY',
      useClass: SseNotificationGateway,
    },
  ],
  // Export both the token and the concrete class so other modules can inject
  // either way (AlertEngineService uses the token; tests may inject the class).
  exports: ['NOTIFICATION_GATEWAY'],
})
export class NotificationsModule {}
