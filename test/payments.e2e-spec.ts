import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Payments & Escrow Lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let clientToken: string;
  let clientId: string;
  let specialistToken: string;
  let specialistId: string;
  let jobId: string;
  let contractId: string;
  let milestoneId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    const ts = Date.now();
    const pass = 'TestPassword123!';

    // Register Client
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: `client_pay_${ts}@test.com`, password: pass, role: 'CLIENT' });

    const cLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `client_pay_${ts}@test.com`, password: pass });
    clientToken = cLogin.body.accessToken;
    clientId = cLogin.body.user.id;

    // Register Specialist
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: `spec_pay_${ts}@test.com`, password: pass, role: 'SPECIALIST' });

    const sLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `spec_pay_${ts}@test.com`, password: pass });
    specialistToken = sLogin.body.accessToken;
    specialistId = sLogin.body.user.id;

    // Create Job
    const jobRes = await request(app.getHttpServer())
      .post('/jobs')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        title: 'Full Stack App Development',
        description: 'Need NestJS and React developer for fintech app',
        budget: 20000,
      });
    jobId = jobRes.body.id;

    // Create Contract with Milestone
    const contractRes = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        jobId,
        specialistId,
        milestones: [
          {
            title: 'Backend API & Payments',
            description: 'Implement NestJS payments',
            amount: 15000,
          },
        ],
      });
    contractId = contractRes.body.id;
    milestoneId = contractRes.body.milestones[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Client initiates JazzCash checkout session', async () => {
    const res = await request(app.getHttpServer())
      .post('/payments/checkout/initiate')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        amount: 15000,
        provider: 'JAZZCASH',
        contractId,
        description: 'Milestone 1 Escrow Funding',
      })
      .expect(201);

    expect(res.body).toHaveProperty('referenceId');
    expect(res.body.referenceId).toMatch(/^PAY-/);
    expect(res.body.status).toBe('PENDING');
    expect(res.body).toHaveProperty('checkoutPayload');
    expect(res.body.checkoutPayload.pp_Amount).toBe('1500000');
  });

  it('Specialist cannot initiate contract milestone checkout (403 Forbidden)', () => {
    return request(app.getHttpServer())
      .post('/payments/checkout/initiate')
      .set('Authorization', `Bearer ${specialistToken}`)
      .send({
        amount: 15000,
        provider: 'JAZZCASH',
        contractId,
      })
      .expect(403);
  });

  it('Simulate sandbox payment and verify contract escrow is funded', async () => {
    // 1. Initiate Sandbox payment
    const initRes = await request(app.getHttpServer())
      .post('/payments/checkout/initiate')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        amount: 15000,
        provider: 'SANDBOX',
        contractId,
      })
      .expect(201);

    const ref = initRes.body.referenceId;

    // 2. Simulate success
    const simRes = await request(app.getHttpServer())
      .post('/payments/sandbox/simulate')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ referenceId: ref })
      .expect(201);

    expect(simRes.body.status).toBe('COMPLETED');

    // 3. Verify contract status is now FUNDED and escrow balance is 15000
    const contractRes = await request(app.getHttpServer())
      .get(`/contracts/${contractId}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(200);

    expect(contractRes.body.status).toBe('FUNDED');
    expect(Number(contractRes.body.escrow.balance)).toBe(15000);
  });

  it('Client releases milestone funds to specialist wallet atomically', async () => {
    // 1. Specialist initial balance is 0
    const initialBal = await request(app.getHttpServer())
      .get('/wallet/balance')
      .set('Authorization', `Bearer ${specialistToken}`)
      .expect(200);
    expect(Number(initialBal.body.balance)).toBe(0);

    // 2. Client releases milestone
    const releaseRes = await request(app.getHttpServer())
      .patch(`/contracts/milestones/${milestoneId}/release`)
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(200);

    expect(releaseRes.body.milestone.status).toBe('RELEASED');
    expect(Number(releaseRes.body.remainingEscrowBalance)).toBe(0);

    // 3. Specialist balance is now 15000
    const updatedBal = await request(app.getHttpServer())
      .get('/wallet/balance')
      .set('Authorization', `Bearer ${specialistToken}`)
      .expect(200);

    expect(Number(updatedBal.body.balance)).toBe(15000);
    expect(Number(updatedBal.body.availableBalance)).toBe(15000);
  });

  it('JazzCash callback is idempotent and prevents double-funding', async () => {
    // 1. Initiate another payment
    const initRes = await request(app.getHttpServer())
      .post('/payments/checkout/initiate')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        amount: 5000,
        provider: 'JAZZCASH',
        contractId,
      })
      .expect(201);

    const ref = initRes.body.referenceId;

    // 2. Webhook callback with success
    const cb1 = await request(app.getHttpServer())
      .post('/payments/jazzcash/callback')
      .send({
        pp_TxnRefNo: ref,
        pp_ResponseCode: '000',
        pp_ResponseMessage: 'Success',
        pp_Amount: '500000',
        pp_RetreivalReferenceNo: 'JC998877',
      })
      .expect(201);

    expect(cb1.body.status).toBe('SUCCESS');

    // 3. Duplicate webhook callback returns OK without double-crediting
    const cb2 = await request(app.getHttpServer())
      .post('/payments/jazzcash/callback')
      .send({
        pp_TxnRefNo: ref,
        pp_ResponseCode: '000',
        pp_ResponseMessage: 'Success',
        pp_Amount: '500000',
      })
      .expect(201);

    expect(cb2.body.message).toContain('already processed');
  });
});
