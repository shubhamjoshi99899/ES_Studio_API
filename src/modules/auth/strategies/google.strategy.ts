import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private config: ConfigService) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID')?.trim();
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET')?.trim();
    const callbackURL =
      config.get<string>('GOOGLE_CALLBACK_URL')?.trim()
      ?? 'http://localhost:5000/api/auth/google/callback';
    const missing = [
      !clientID ? 'GOOGLE_CLIENT_ID' : null,
      !clientSecret ? 'GOOGLE_CLIENT_SECRET' : null,
    ]
      .filter(Boolean)
      .join(', ');

    super({
      clientID: clientID || 'google-oauth-disabled',
      clientSecret: clientSecret || 'google-oauth-disabled',
      callbackURL,
      scope: ['email', 'profile'],
    });

    if (!clientID || !clientSecret) {
      new Logger(GoogleStrategy.name).warn(
        `Google OAuth is not fully configured. Missing: ${missing}. Google auth routes will not work until these env vars are set.`,
      );
    }
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): void {
    const email = profile.emails[0].value;
    const name = profile.displayName;
    const googleId = profile.id;
    const avatar = profile.photos?.[0]?.value ?? null;
    done(null, { email, name, googleId, avatar });
  }
}
