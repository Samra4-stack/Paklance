import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Proposals Workflow (e2e)', () => {
  let app: INestApplication<App>;
  let clientToken: string;
  let specialistToken: string;
  let unauthClientToken: string;
  let jobId: string;
  let proposalId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const timestamp = Date.now();
    const pass = 'TestPassword123!';

    // Register & Login Client A
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `ca_${timestamp}@test.com`,
        password: pass,
        name: 'Client A',
        role: 'CLIENT',
      });
    const ca = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `ca_${timestamp}@test.com`, password: pass });
    clientToken = ca.body.accessToken;

    // Register & Login Client B (Unauthorized)
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `cb_${timestamp}@test.com`,
        password: pass,
        name: 'Client B',
        role: 'CLIENT',
      });
    const cb = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `cb_${timestamp}@test.com`, password: pass });
    unauthClientToken = cb.body.accessToken;

    // Register & Login Specialist
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `s_${timestamp}@test.com`,
        password: pass,
        name: 'Spec',
        role: 'SPECIALIST',
      });
    const s = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `s_${timestamp}@test.com`, password: pass });
    specialistToken = s.body.accessToken;

    // Client creates a job
    const jobRes = await request(app.getHttpServer())
      .post('/jobs')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        title: 'Job for proposal',
        description: 'Desc',
        budget: 100,
        category: 'Dev',
        skills: [],
        type: 'FIXED',
      });
    jobId = jobRes.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Specialist submits a proposal', () => {
    return request(app.getHttpServer())
      .post('/proposals')
      .set('Authorization', `Bearer ${specialistToken}`)
      .send({
        jobId: jobId,
        coverLetter: 'I can do this.',
        bidAmount: 90,
        deliveryDays: 3,
      })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('id');
        proposalId = res.body.id;
      });
  });

  it('Client retrieves proposals for their job', () => {
    return request(app.getHttpServer())
      .get(`/proposals/job/${jobId}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0].id).toBe(proposalId);
      });
  });

  it('Unauthorized client cannot retrieve proposals for another clients job', () => {
    return request(app.getHttpServer())
      .get(`/proposals/job/${jobId}`)
      .set('Authorization', `Bearer ${unauthClientToken}`)
      .expect(403);
  });
});
