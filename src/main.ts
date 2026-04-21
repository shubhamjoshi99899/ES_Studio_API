import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

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

  // Health check — no auth required, used by Docker HEALTHCHECK
  app.use('/health', (_req: any, res: any) => {
    res.status(200).json({ status: 'ok' });
  });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  app.enableCors({
    origin: frontendUrl === '*' ? true : frontendUrl,
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 5000);
}
bootstrap();
