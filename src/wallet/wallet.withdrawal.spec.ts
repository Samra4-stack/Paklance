import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutType, WithdrawalStatus } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { WithdrawDto } from './dto/withdraw.dto';

describe('WalletService - Withdrawal Channel & Validation Tests', () => {
  let service: WalletService;
  let prisma: any;

  const mockWallet = {
    id: 'wallet-123',
    userId: 'user-1',
    balance: 10000,
    lockedBalance: 0,
  };

  beforeEach(() => {
    prisma = {
      wallet: {
        findUnique: jest.fn().mockResolvedValue(mockWallet),
        findFirst: jest.fn().mockResolvedValue(mockWallet),
        create: jest.fn().mockResolvedValue(mockWallet),
        update: jest.fn().mockResolvedValue(mockWallet),
      },
      payoutMethod: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      withdrawalRequest: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'wd-1', ...data })),
      },
      walletTransaction: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'tx-1', ...data })),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    service = new WalletService(prisma as PrismaService);
  });

  describe('WithdrawDto class-validator tests', () => {
    it('should validate valid BANK withdrawal with type', async () => {
      const dto = plainToInstance(WithdrawDto, {
        amount: 2500,
        type: PayoutType.BANK,
        accountTitle: 'Ali Khan',
        accountNumber: 'PK36SCBL0000001123456701',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should validate valid JAZZCASH withdrawal with channel', async () => {
      const dto = plainToInstance(WithdrawDto, {
        amount: 1500,
        channel: PayoutType.JAZZCASH,
        accountTitle: 'Ali Khan',
        accountNumber: '03001234567',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should validate valid EASYPAISA withdrawal with both type and channel', async () => {
      const dto = plainToInstance(WithdrawDto, {
        amount: 3000,
        type: PayoutType.EASYPAISA,
        channel: PayoutType.EASYPAISA,
        accountTitle: 'Sara Ahmed',
        accountNumber: '03451234567',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid channel enum value', async () => {
      const dto = plainToInstance(WithdrawDto, {
        amount: 1000,
        channel: 'INVALID_CHANNEL' as any,
        accountTitle: 'Ali Khan',
        accountNumber: '03001234567',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('channel');
    });

    it('should reject amount less than 1', async () => {
      const dto = plainToInstance(WithdrawDto, {
        amount: 0,
        channel: PayoutType.BANK,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('amount');
    });
  });

  describe('WalletService.withdraw business logic', () => {
    it('should successfully submit withdrawal with BANK type', async () => {
      const res = await service.withdraw('user-1', {
        amount: 2500,
        type: PayoutType.BANK,
        accountTitle: 'Ali Khan',
        accountNumber: 'PK36SCBL0000001123456701',
      });

      expect(res.withdrawalRequest).toBeDefined();
      expect(res.withdrawalRequest.amount).toBe(2500);
      expect(res.withdrawalRequest.status).toBe(WithdrawalStatus.REQUESTED);
      expect(res.withdrawalRequest.payoutMethodSnapshot.type).toBe(PayoutType.BANK);
      expect(res.withdrawalRequest.payoutMethodSnapshot.bankName).toBe('Bank Transfer (1Link)');
    });

    it('should successfully submit withdrawal with JAZZCASH channel', async () => {
      const res = await service.withdraw('user-1', {
        amount: 1000,
        channel: PayoutType.JAZZCASH,
        accountTitle: 'Zainab Bibi',
        accountNumber: '03009876543',
      });

      expect(res.withdrawalRequest).toBeDefined();
      expect(res.withdrawalRequest.amount).toBe(1000);
      expect(res.withdrawalRequest.payoutMethodSnapshot.type).toBe(PayoutType.JAZZCASH);
      expect(res.withdrawalRequest.payoutMethodSnapshot.bankName).toBe('JAZZCASH');
    });

    it('should successfully submit withdrawal with EASYPAISA channel', async () => {
      const res = await service.withdraw('user-1', {
        amount: 2000,
        channel: PayoutType.EASYPAISA,
        accountTitle: 'Usman Tariq',
        accountNumber: '03459876543',
      });

      expect(res.withdrawalRequest.payoutMethodSnapshot.type).toBe(PayoutType.EASYPAISA);
    });

    it('should reject if channel and type mismatch', async () => {
      await expect(
        service.withdraw('user-1', {
          amount: 1000,
          type: PayoutType.BANK,
          channel: PayoutType.JAZZCASH,
          accountTitle: 'Ali Khan',
          accountNumber: '03001234567',
        }),
      ).rejects.toThrow(new BadRequestException('Payout channel and type mismatch'));
    });

    it('should reject if neither type nor channel is specified', async () => {
      await expect(
        service.withdraw('user-1', {
          amount: 1000,
          accountTitle: 'Ali Khan',
          accountNumber: '03001234567',
        }),
      ).rejects.toThrow(new BadRequestException('Payout channel or type must be specified'));
    });

    it('should reject withdrawal amount below minimum PKR 500', async () => {
      await expect(
        service.withdraw('user-1', {
          amount: 400,
          type: PayoutType.BANK,
          accountTitle: 'Ali Khan',
          accountNumber: '03001234567',
        }),
      ).rejects.toThrow(new BadRequestException('Minimum withdrawal amount is PKR 500'));
    });

    it('should reject withdrawal if balance is insufficient', async () => {
      prisma.wallet.findFirst.mockResolvedValueOnce({
        id: 'wallet-123',
        userId: 'user-1',
        balance: 1000,
        lockedBalance: 800,
      });

      await expect(
        service.withdraw('user-1', {
          amount: 500,
          type: PayoutType.BANK,
          accountTitle: 'Ali Khan',
          accountNumber: '03001234567',
        }),
      ).rejects.toThrow(/Insufficient available balance/);
    });

    it('should reject if user tries to use a payoutMethodId owned by someone else', async () => {
      prisma.payoutMethod.findUnique.mockResolvedValueOnce({
        id: 'pm-999',
        userId: 'other-user',
        type: PayoutType.BANK,
        accountTitle: 'Other User',
        accountNumber: 'PK0000000000000000000000',
      });

      await expect(
        service.withdraw('user-1', {
          amount: 1000,
          payoutMethodId: 'pm-999',
        }),
      ).rejects.toThrow(new ForbiddenException('You do not own this payout method'));
    });

    it('should reject if payoutMethodId is not found', async () => {
      prisma.payoutMethod.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.withdraw('user-1', {
          amount: 1000,
          payoutMethodId: 'pm-nonexistent',
        }),
      ).rejects.toThrow(new NotFoundException('Payout method not found'));
    });
  });
});
