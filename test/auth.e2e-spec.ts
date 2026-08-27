import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Authentication Workflow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const timestamp = Date.now();
  const validEmail = `test_specialist_${timestamp}@test.com`;
  const validClientEmail = `test_client_${timestamp}@test.com`;
  const password = 'TestPassword123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    // Clean up test data safely since we are in isolated DB
    await prisma.user.deleteMany({
      where: { email: { in: [validEmail, validClientEmail] } },
    });
    await app.close();
  });

  describe('Registration & Login', () => {
    it('should register a new specialist', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: validEmail,
          password: password,
          name: 'E2E Specialist',
          role: 'SPECIALIST',
        })
        .expect((res) => {
          if (res.status === 500) {
            console.error('500 Error Body:', res.body);
            console.error('500 Error Text:', res.text);
          }
          expect(res.status).toBe(201);
        })
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body.user.role).toBe('SPECIALIST');
          expect(res.body.user).not.toHaveProperty('passwordHash');
        });
    });

    it('should reject duplicate email', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: validEmail,
          password: password,
          name: 'Duplicate',
          role: 'SPECIALIST',
        })
        .expect(409); // Or 409 depending on implementation
    });

    it('should login with the registered specialist', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: validEmail,
          password: password,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body.user.email).toBe(validEmail);
        });
    });

    it('should reject invalid login', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: validEmail,
          password: 'wrongpassword',
        })
        .expect(401);
    });

    it('should register a new client', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: validClientEmail,
          password: password,
          name: 'E2E Client',
          role: 'CLIENT',
        })
        .expect(201);
    });
  });

  describe('Protected Routes', () => {
    let token: string;
    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: validClientEmail, password: password });
      token = res.body.accessToken;
    });

    it('should allow access with valid JWT', () => {
      return request(app.getHttpServer())
        .get('/profiles/me') // Corrected to real route
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should reject access with invalid JWT', () => {
      return request(app.getHttpServer())
        .get('/profiles/me')
        .set('Authorization', `Bearer invalid-token-123`)
        .expect(401);
    });

    it('should reject access without JWT', () => {
      return request(app.getHttpServer()).get('/profiles/me').expect(401);
    });
  });
});
