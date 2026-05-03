import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { WorkspaceId } from '../../common/decorators/workspace-id.decorator';
import { StripeService } from './stripe.service';

class CreateCheckoutDto {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

@Controller('api/billing')
@ApiTags('billing')
export class BillingController {
  constructor(private readonly stripeService: StripeService) {}

  // ── POST /api/billing/checkout ───────────────────────────────────────────

  @Post('checkout')
  async createCheckout(
    @WorkspaceId() workspaceId: string,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.stripeService.createCheckoutSession(
      workspaceId,
      dto.priceId,
      dto.successUrl,
      dto.cancelUrl,
    );
  }

  // ── POST /api/billing/webhook ────────────────────────────────────────────
  // @Public() — Stripe hits this without JWT.
  // Raw body is required for signature verification. The raw body middleware
  // in main.ts populates req.rawBody for this route path.

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async stripeWebhook(@Req() req: RawBodyRequest<Request>) {
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) return { received: false };

    const rawBody = req.rawBody;
    if (!rawBody) return { received: false };

    await this.stripeService.handleWebhook(rawBody, signature);
    return { received: true };
  }

  // ── GET /api/billing/subscription ───────────────────────────────────────

  @Get('subscription')
  async getSubscription(@WorkspaceId() workspaceId: string) {
    return this.stripeService['subRepo'].findOne({ where: { workspaceId } });
  }

  // ── POST /api/billing/cancel ─────────────────────────────────────────────

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@WorkspaceId() workspaceId: string) {
    await this.stripeService.cancelSubscription(workspaceId);
    return { message: 'Subscription set to cancel at end of billing period' };
  }
}
