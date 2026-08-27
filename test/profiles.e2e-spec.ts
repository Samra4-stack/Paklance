import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Profiles Workflow (e2e)', () => {
  let app: INestApplication<App>;
  let userA: any, tokenA: string;
  let userB: any, tokenB: string;

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
        email: `profile_a_${ts}@test.com`,
        password: pass,
        name: 'PA',
        role: 'SPECIALIST',
      });
    const resA = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `profile_a_${ts}@test.com`, password: pass });
    tokenA = resA.body.accessToken;
    userA = resA.body.user;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `profile_b_${ts}@test.com`,
        password: pass,
        name: 'PB',
        role: 'SPECIALIST',
      });
    const resB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `profile_b_${ts}@test.com`, password: pass });
    tokenB = resB.body.accessToken;
    userB = resB.body.user;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Retrieve profile', () => {
    return request(app.getHttpServer())
      .get(`/profiles/${userA.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.id).toBe(userA.id);
        expect(res.body.bio).toBeNull();
      });
  });

  it('Update own profile', () => {
    return request(app.getHttpServer())
      .patch(`/profiles/me`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        bio: 'Updated Bio for User A',
      })
      .expect(200)
      .expect((res) => {
        expect(res.body.bio).toBe('Updated Bio for User A');
      });
  });

  it('Verify persistence', () => {
    return request(app.getHttpServer())
      .get(`/profiles/${userA.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.bio).toBe('Updated Bio for User A');
      });
  });

  it('Verify unauthorized modification is rejected', () => {
    // Attempting to modify profile without token
    return request(app.getHttpServer())
      .patch(`/profiles/me`)
      .send({
        bio: 'Hacked',
      })
      .expect(401);
  });
});
