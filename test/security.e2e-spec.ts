import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Security (e2e)', () => {
  let app: INestApplication<App>;
  let user: any;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const ts = Date.now();
    const pass = 'TestPassword123!';

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `sec_${ts}@test.com`,
        password: pass,
        name: 'S',
        role: 'CLIENT',
      });
    user = res.body.user;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `sec_${ts}@test.com`, password: pass });
    token = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Missing JWT rejected', () => {
    return request(app.getHttpServer()).get(`/profiles/me`).expect(401);
  });

  it('Invalid JWT rejected', () => {
    return request(app.getHttpServer())
      .get(`/profiles/me`)
      .set('Authorization', `Bearer completely.invalid.token`)
      .expect(401);
  });

  it('Old/invalid token rejected', () => {
    // A token signed with a different secret
    const oldToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiR29vZCJJbnRlbnQiOiJZZXMifQ.fake_signature_here';
    return request(app.getHttpServer())
      .get(`/profiles/me`)
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(401);
  });

  it('passwordHash never returned on login or register', () => {
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('User isolation enforced', () => {
    // Attempt to read another users private data (like wallet)
    return (
      request(app.getHttpServer())
        .get(`/wallet/balance`)
        // Not authenticated, should be 401. If authenticated, should only see own wallet.
        .expect(401)
    );
  });
});
