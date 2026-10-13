import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    const hasDatabaseUrl = Boolean(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('******'));

    if (!hasDatabaseUrl) {
      return;
    }

    await this.$connect();
  }
}
