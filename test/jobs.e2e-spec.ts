import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Jobs Workflow (e2e)', () => {
  let app: INestApplication<App>;
  let clientToken: string;
  let specialistToken: string;
  let jobId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const timestamp = Date.now();
    const clientEmail = `client_jobs_${timestamp}@test.com`;
    const specialistEmail = `specialist_jobs_${timestamp}@test.com`;
    const password = 'TestPassword123!';

    // Register & Login Client
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: clientEmail,
        password,
        name: 'Jobs Client',
        role: 'CLIENT',
      })
      .expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: clientEmail,
        password,
      });
    clientToken = loginRes.body.accessToken;

    // Register & Login Specialist
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: specialistEmail,
        password,
        name: 'Jobs Specialist',
        role: 'SPECIALIST',
      })
      .expect(201);
    const specLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: specialistEmail,
        password,
      });
    specialistToken = specLoginRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Job Creation and Retrieval', () => {
    it('should create a new job post as a client', () => {
      return request(app.getHttpServer())
        .post('/jobs')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          title: 'Test Job for E2E',
          description: 'This is a test description for an e2e job post.',
          budget: 5000,
          category: 'Development',
          skills: ['Node.js', 'NestJS'],
          type: 'FIXED',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          jobId = res.body.id;
        });
    });

    it('specialist should NOT be able to create a job', () => {
      return request(app.getHttpServer())
        .post('/jobs')
        .set('Authorization', `Bearer ${specialistToken}`)
        .send({
          title: 'Specialist Job',
          description: 'Should fail',
          budget: 100,
          category: 'Development',
          skills: [],
          type: 'FIXED',
        })
        .expect(403);
    });

    it('should retrieve the list of jobs', () => {
      return request(app.getHttpServer())
        .get('/jobs')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          const found = res.body.find((j: any) => j.id === jobId);
          expect(found).toBeDefined();
        });
    });

    it('should retrieve the specific job by id', () => {
      return request(app.getHttpServer())
        .get(`/jobs/${jobId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(jobId);
        });
    });
  });
});
