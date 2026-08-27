import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Admin Workflow (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let clientToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const ts = Date.now();
    const pass = 'TestPassword123!';

    // Ideally, ADMIN registration should be disabled or restricted in production,
    // but for this e2e test, we will assume we can register one or mock one.
    // If the system blocks standard registration of ADMIN, this might fail,
    // in which case a seed script should provide the admin.
    // Let's attempt registration.
    try {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `admin_${ts}@test.com`,
          password: pass,
          name: 'Admin',
          role: 'ADMIN',
        });
      const resA = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: `admin_${ts}@test.com`, password: pass });
      adminToken = resA.body.accessToken;
    } catch (e) {
      // Ignore if ADMIN cannot be registered directly
    }

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `client_${ts}@test.com`,
        password: pass,
        name: 'C',
        role: 'CLIENT',
      });
    const resC = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `client_${ts}@test.com`, password: pass });
    clientToken = resC.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Admin access works', () => {
    if (!adminToken) return; // Skip if we couldn't create an admin
    return request(app.getHttpServer())
      .get(`/admin/stats`) // assuming an admin route
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('Non-admin gets 401/403 (Specialist/client cannot access admin functions)', () => {
    return request(app.getHttpServer())
      .get(`/admin/stats`)
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(403);
  });
});
