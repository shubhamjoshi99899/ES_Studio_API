import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { User } from './entities/user.entity';
import { Session } from './entities/session.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SetupGuard } from '../../common/guards/setup.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session]),

    // JwtModule registered without a default secret — each sign/verify call
    // passes the secret explicitly so access and refresh secrets stay separate.
    JwtModule.register({}),

    ThrottlerModule.forRoot([
      {
        // Default bucket: 100 req / 60 s — per-endpoint overrides via @Throttle()
        ttl: 60_000,
        limit: 100,
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SetupGuard,

    // Global JWT guard replaces the old ApiKeyGuard
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },

    // Global throttler guard — enforces @Throttle() decorators app-wide
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
