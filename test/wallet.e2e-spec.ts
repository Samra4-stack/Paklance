import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Wallet & Payout Workflow (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  let payoutMethodId: string;
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

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `wallet_spec_${ts}@test.com`,
        password: pass,
        role: 'SPECIALIST',
      });
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `wallet_spec_${ts}@test.com`, password: pass });
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Authenticated wallet/balance access returns balance breakdown', () => {
    return request(app.getHttpServer())
      .get(`/wallet/balance`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('balance');
        expect(res.body).toHaveProperty('lockedBalance');
        expect(res.body).toHaveProperty('availableBalance');
        expect(Number(res.body.balance)).toBe(0);
        expect(Number(res.body.availableBalance)).toBe(0);
      });
  });

  it('Unauthorized access rejected with 401', () => {
    return request(app.getHttpServer()).get(`/wallet/balance`).expect(401);
  });

  it('Deposit funds increases wallet balance', async () => {
    await request(app.getHttpServer())
      .post('/wallet/deposit')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 10000 })
      .expect(201);

    const balRes = await request(app.getHttpServer())
      .get('/wallet/balance')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Number(balRes.body.balance)).toBe(10000);
    expect(Number(balRes.body.availableBalance)).toBe(10000);
  });

  it('Create and list saved PayoutMethods', async () => {
    // 1. Add Bank Account
    const bankRes = await request(app.getHttpServer())
      .post('/wallet/payout-methods')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'BANK',
        accountTitle: 'Areeba Batool',
        accountNumber: 'PK36SCBL0000001234567801',
        bankName: 'Standard Chartered',
        isDefault: true,
      })
      .expect(201);

    expect(bankRes.body).toHaveProperty('id');
    expect(bankRes.body.isDefault).toBe(true);
    payoutMethodId = bankRes.body.id;

    // 2. Add JazzCash Account
    const jcRes = await request(app.getHttpServer())
      .post('/wallet/payout-methods')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'JAZZCASH',
        accountTitle: 'Areeba JazzCash',
        accountNumber: '03001234567',
        isDefault: false,
      })
      .expect(201);

    expect(jcRes.body.isDefault).toBe(false);

    // 3. List methods
    const listRes = await request(app.getHttpServer())
      .get('/wallet/payout-methods')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listRes.body.length).toBe(2);
  });

  it('Set default payout method', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/wallet/payout-methods')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const jc = listRes.body.find((m: any) => m.type === 'JAZZCASH');
    await request(app.getHttpServer())
      .patch(`/wallet/payout-methods/${jc.id}/default`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const updatedList = await request(app.getHttpServer())
      .get('/wallet/payout-methods')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const updatedJc = updatedList.body.find((m: any) => m.id === jc.id);
    expect(updatedJc.isDefault).toBe(true);
  });

  it('Withdrawal under minimum PKR 500 is rejected with 400', () => {
    return request(app.getHttpServer())
      .post('/wallet/withdraw')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100 })
      .expect(400);
  });

  it('Withdrawal exceeding balance is rejected with 400', () => {
    return request(app.getHttpServer())
      .post('/wallet/withdraw')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 20000 })
      .expect(400);
  });

  it('Valid withdrawal reserves funds in lockedBalance and creates REQUESTED request', async () => {
    const withdrawRes = await request(app.getHttpServer())
      .post('/wallet/withdraw')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 4000, payoutMethodId })
      .expect(201);

    expect(withdrawRes.body).toHaveProperty('withdrawalRequest');
    expect(withdrawRes.body.withdrawalRequest.status).toBe('REQUESTED');
    expect(withdrawRes.body.withdrawalRequest.referenceId).toMatch(/^WD-/);
    withdrawalId = withdrawRes.body.withdrawalRequest.id;

    // Check balance: balance remains 10000, lockedBalance is 4000, available is 6000
    const balRes = await request(app.getHttpServer())
      .get('/wallet/balance')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Number(balRes.body.balance)).toBe(10000);
    expect(Number(balRes.body.lockedBalance)).toBe(4000);
    expect(Number(balRes.body.availableBalance)).toBe(6000);
  });

  it('Cancel withdrawal request restores locked funds to available balance', async () => {
    await request(app.getHttpServer())
      .post(`/wallet/withdrawals/${withdrawalId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const balRes = await request(app.getHttpServer())
      .get('/wallet/balance')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Number(balRes.body.balance)).toBe(10000);
    expect(Number(balRes.body.lockedBalance)).toBe(0);
    expect(Number(balRes.body.availableBalance)).toBe(10000);
  });
});
