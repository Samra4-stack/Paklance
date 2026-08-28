import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Admin Financial Controls (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let clientToken: string;
  let specialistToken: string;
  let withdrawalId: string;

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

    // Register ADMIN
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: `admin_fin_${ts}@test.com`, password: pass, role: 'ADMIN' });
    const aLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `admin_fin_${ts}@test.com`, password: pass });
    adminToken = aLogin.body.accessToken;

    // Register CLIENT
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: `client_fin_${ts}@test.com`, password: pass, role: 'CLIENT' });
    const cLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `client_fin_${ts}@test.com`, password: pass });
    clientToken = cLogin.body.accessToken;

    // Register SPECIALIST
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: `spec_fin_${ts}@test.com`, password: pass, role: 'SPECIALIST' });
    const sLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `spec_fin_${ts}@test.com`, password: pass });
    specialistToken = sLogin.body.accessToken;

    // Give specialist 8000 balance and request a withdrawal
    await request(app.getHttpServer())
      .post('/wallet/deposit')
      .set('Authorization', `Bearer ${specialistToken}`)
      .send({ amount: 8000 });

    const wRes = await request(app.getHttpServer())
      .post('/wallet/withdraw')
      .set('Authorization', `Bearer ${specialistToken}`)
      .send({
        amount: 3000,
        type: 'BANK',
        accountTitle: 'Test Specialist',
        accountNumber: 'PK00BANK00001234',
      });
    withdrawalId = wRes.body.withdrawalRequest.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Non-admin users cannot access admin financials (403 Forbidden)', async () => {
    await request(app.getHttpServer())
      .get('/admin/financials/stats')
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/admin/financials/withdrawals')
      .set('Authorization', `Bearer ${specialistToken}`)
      .expect(403);
  });

  it('Admin retrieves comprehensive financial stats', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/financials/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('totalEscrowBalance');
    expect(res.body).toHaveProperty('completedPaymentsVolume');
    expect(res.body).toHaveProperty('pendingWithdrawalsCount');
    expect(res.body.pendingWithdrawalsCount).toBeGreaterThanOrEqual(1);
  });

  it('Admin views list of withdrawals and marks one as PROCESSING', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/admin/financials/withdrawals')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThanOrEqual(1);

    const procRes = await request(app.getHttpServer())
      .patch(`/admin/financials/withdrawals/${withdrawalId}/process`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'PROCESSING', adminNote: 'Batch payout sent to 1Link' })
      .expect(200);

    expect(procRes.body.status).toBe('PROCESSING');
    expect(procRes.body.adminNote).toContain('1Link');
  });

  it('Admin completes withdrawal and verifies balance is permanently deducted', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/financials/withdrawals/${withdrawalId}/process`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'COMPLETED', adminNote: '1Link Bank Transfer Confirmed' })
      .expect(200);

    // Specialist balance was 8000, 3000 withdrawn -> remaining balance 5000, locked 0
    const balRes = await request(app.getHttpServer())
      .get('/wallet/balance')
      .set('Authorization', `Bearer ${specialistToken}`)
      .expect(200);

    expect(Number(balRes.body.balance)).toBe(5000);
    expect(Number(balRes.body.lockedBalance)).toBe(0);
    expect(Number(balRes.body.availableBalance)).toBe(5000);
  });
});
