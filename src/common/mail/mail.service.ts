import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  /** Stub — real SMTP wired in Phase 2. */
  async sendInvite(email: string, token: string): Promise<void> {
    this.logger.log(`[STUB] Sending invite to ${email} (token: ${token.slice(0, 8)}...)`);
  }
}
