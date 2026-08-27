import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Messaging Workflow (e2e)', () => {
  let app: INestApplication<App>;
  let userA: any, tokenA: string;
  let userB: any, tokenB: string;
  let userC: any, tokenC: string;
  let conversationId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const ts = Date.now();
    const pass = 'TestPassword123!';

    // Register & Login A
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `a_${ts}@test.com`,
        password: pass,
        name: 'A',
        role: 'CLIENT',
      });
    const resA = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `a_${ts}@test.com`, password: pass });
    tokenA = resA.body.accessToken;
    userA = resA.body.user;

    // Register & Login B
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `b_${ts}@test.com`,
        password: pass,
        name: 'B',
        role: 'SPECIALIST',
      });
    const resB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `b_${ts}@test.com`, password: pass });
    tokenB = resB.body.accessToken;
    userB = resB.body.user;

    // Register & Login C
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `c_${ts}@test.com`,
        password: pass,
        name: 'C',
        role: 'CLIENT',
      });
    const resC = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `c_${ts}@test.com`, password: pass });
    tokenC = resC.body.accessToken;
    userC = resC.body.user;
  });

  afterAll(async () => {
    await app.close();
  });

  it('User A sends message to User B', () => {
    return request(app.getHttpServer())
      .post('/messaging/send')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        receiverId: userB.id,
        content: 'Hello User B',
      })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('id');
        expect(res.body.content).toBe('Hello User B');
        conversationId = res.body.conversationId;
      });
  });

  it('User B retrieves message', () => {
    return request(app.getHttpServer())
      .get(`/messaging/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0].content).toBe('Hello User B');
      });
  });

  it('Message persists after fresh request', () => {
    return request(app.getHttpServer())
      .get(`/messaging/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.length).toBe(1);
      });
  });

  it('User C cannot access A and B conversation', () => {
    return request(app.getHttpServer())
      .get(`/messaging/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tokenC}`)
      .expect(403);
  });
});
