import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = parseInt(this.configService.get<string>('SMTP_PORT') ?? '587', 10);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    try {
      await this.transporter.verify();
      this.logger.log(`SMTP transporter verified: ${host}:${port}`);
    } catch (error) {
      this.logger.warn(`SMTP verification failed: ${this.getErrorMessage(error)}`);
    }
  }

  async sendInvite(to: string, token: string, workspaceSlug?: string): Promise<void> {
    try {
      if (!this.transporter) {
        this.logger.warn(`Invite email skipped for ${to}: SMTP transporter is not configured`);
        return;
      }

      const appUrl = this.configService.get<string>('APP_URL') ?? 'http://localhost:3000';
      const inviteUrl =
        `${appUrl}/accept-invite?token=${encodeURIComponent(token)}` +
        `&workspace=${encodeURIComponent(workspaceSlug ?? '')}`;

      await this.transporter.sendMail({
        from: this.getFromAddress(),
        to,
        subject: 'You have been invited to SocialMetrics',
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
            <h2>Workspace invite</h2>
            <p>You have been invited to join a SocialMetrics workspace.</p>
            <p><a href="${inviteUrl}">Accept your invite</a></p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send invite email to ${to}: ${this.getErrorMessage(error)}`);
    }
  }

  async sendMail(options: { to: string; subject: string; html?: string; text?: string }): Promise<void> {
    try {
      if (!this.transporter) {
        this.logger.warn(`Email skipped for ${options.to}: SMTP transporter is not configured`);
        return;
      }
      await this.transporter.sendMail({
        from: this.getFromAddress(),
        ...options,
      });
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}: ${this.getErrorMessage(error)}`);
    }
  }

  async sendAlertEmail(to: string, alertName: string, metricSummary: string): Promise<void> {
    try {
      if (!this.transporter) {
        this.logger.warn(`Alert email skipped for ${to}: SMTP transporter is not configured`);
        return;
      }

      await this.transporter.sendMail({
        from: this.getFromAddress(),
        to,
        subject: `SocialMetrics alert: ${alertName}`,
        text: metricSummary,
      });
    } catch (error) {
      this.logger.error(`Failed to send alert email to ${to}: ${this.getErrorMessage(error)}`);
    }
  }

  private getFromAddress(): string {
    return (
      this.configService.get<string>('SMTP_FROM') ??
      this.configService.get<string>('SMTP_USER') ??
      'no-reply@socialmetrics.local'
    );
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
