import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AdminApiKeyGuard } from './admin-api-key.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { Msg91Service } from './msg91.service.js';
import { PrismaService } from './prisma.service.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { ReassignmentScheduler } from './reassignment.scheduler.js';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [AppController, AuthController],
  providers: [
    AppService,
    AuthService,
    Msg91Service,
    PrismaService,
    AdminApiKeyGuard,
    RealtimeGateway,
    ReassignmentScheduler,
  ],
})
export class AppModule {}
