import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Wallet Workflow (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const ts = Date.now();
    const pass = 'TestPassword123!';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `wallet_${ts}@test.com`,
        password: pass,
        name: 'W',
        role: 'SPECIALIST',
      });
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `wallet_${ts}@test.com`, password: pass });
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Authenticated wallet/balance access', () => {
    return request(app.getHttpServer())
      .get(`/wallet/balance`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('balance');
      });
  });

  it('Unauthorized access rejected', () => {
    return request(app.getHttpServer()).get(`/wallet/balance`).expect(401);
  });
});
