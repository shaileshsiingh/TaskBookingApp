import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AdminApiKeyGuard } from './admin-api-key.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { Msg91Service } from './msg91.service.js';
import { PrismaService } from './prisma.service.js';

@Module({
  imports: [],
  controllers: [AppController, AuthController],
  providers: [
    AppService,
    AuthService,
    Msg91Service,
    PrismaService,
    AdminApiKeyGuard,
  ],
})
export class AppModule {}
