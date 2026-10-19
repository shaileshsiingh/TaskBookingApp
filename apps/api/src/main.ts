import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module.js';
import { AuthService } from './auth.service.js';

dotenv.config({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), 'apps/api/.env')],
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.setGlobalPrefix('api');
  const authService = app.get(AuthService);
  const logger = new Logger('BetterAuth');
  const expressApp = app.getHttpAdapter().getInstance();

  expressApp.use((request: Request, response: Response, next: NextFunction) => {
    if (!/^\/api\/auth(?:\/|$)/.test(request.originalUrl.split('?')[0])) {
      next();
      return;
    }

    try {
      void toNodeHandler(authService.getAuth())(request, response).catch(
        (error: unknown) => {
          logger.error(
            'Authentication request failed.',
            error instanceof Error ? error.stack : String(error),
          );
          if (!response.headersSent) {
            response.status(500).json({
              message: 'Authentication request failed. Please try again.',
            });
          }
        },
      );
    } catch (error) {
      const status =
        error instanceof ServiceUnavailableException
          ? error.getStatus()
          : 500;
      const message =
        error instanceof Error
          ? error.message
          : 'Authentication service is unavailable.';
      if (status >= 500) logger.error(message);
      response.status(status).json({ message });
    }
  });

  expressApp.use(express.json({ limit: '1mb' }));
  expressApp.use(express.urlencoded({ extended: true }));
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
