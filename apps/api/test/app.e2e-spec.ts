import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma.service.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: async () => [{ '?column?': 1 }] })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', database: 'connected' });
  });

  it('/api/bookings (GET) requires the configured admin API key', () => {
    vi.stubEnv('ADMIN_API_KEY', 'test-admin-key');
    return request(app.getHttpServer()).get('/api/bookings').expect(401);
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });
});
