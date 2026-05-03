import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(
    '/api/billing/webhook',
    express.raw({ type: 'application/json' }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.use(cookieParser());
  app.use(compression({ threshold: 1024 })); // Compress responses > 1KB

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  app.enableCors({
    origin: frontendUrl === '*' ? true : frontendUrl,
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('SocialMetrics API')
    .setDescription('SocialMetrics SaaS platform API — Phases 1-4')
    .setVersion('1.0')
    .addCookieAuth('access_token')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 9000);
}
bootstrap();
