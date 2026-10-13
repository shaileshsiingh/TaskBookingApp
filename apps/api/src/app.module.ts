import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AdminApiKeyGuard } from './admin-api-key.guard.js';
import { PrismaService } from './prisma.service.js';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, PrismaService, AdminApiKeyGuard],
})
export class AppModule {}
