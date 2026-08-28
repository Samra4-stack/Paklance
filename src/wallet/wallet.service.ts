import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { PayoutType, WithdrawalStatus } from '@prisma/client';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateWallet(userId: string) {
    let wallet = await this.prisma.wallet.findFirst({ where: { userId } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: { userId, balance: 0, lockedBalance: 0 },
      });
    }
    return wallet;
  }

  async getBalance(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    const balance = Number(wallet.balance);
    const lockedBalance = Number(wallet.lockedBalance || 0);
    const availableBalance = Math.max(0, balance - lockedBalance);

    return {
      balance,
      lockedBalance,
      availableBalance,
    };
  }

  async deposit(userId: string, dto: DepositDto) {
    if (dto.amount <= 0) {
      throw new BadRequestException('Deposit amount must be greater than zero');
    }

    const wallet = await this.getOrCreateWallet(userId);

    const updatedWallet = await this.prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: dto.amount } },
    });

    await this.prisma.walletTransaction.create({
      data: { walletId: wallet.id, amount: dto.amount, type: 'DEPOSIT' },
    });

    return updatedWallet;
  }

  /**
   * Two-phase withdrawal initiation:
   * 1. Validates available balance (balance - lockedBalance >= amount).
   * 2. Moves funds into lockedBalance (reserving them without premature destruction).
   * 3. Creates WithdrawalRequest with status REQUESTED and unique reference ID.
   */
  async withdraw(userId: string, dto: WithdrawDto) {
    if (dto.amount <= 0) {
      throw new BadRequestException('Withdrawal amount must be greater than zero');
    }

    if (dto.amount < 500) {
      throw new BadRequestException('Minimum withdrawal amount is PKR 500');
    }

    const wallet = await this.getOrCreateWallet(userId);
    const balance = Number(wallet.balance);
    const lockedBalance = Number(wallet.lockedBalance || 0);
    const availableBalance = balance - lockedBalance;

    if (availableBalance < dto.amount) {
      throw new BadRequestException(
        `Insufficient available balance. Available: PKR ${availableBalance.toLocaleString()}`,
      );
    }

    // Resolve payout method snapshot
    let snapshot: any = null;
    let payoutMethodId: string | null = null;

    if (dto.payoutMethodId) {
      const pm = await this.prisma.payoutMethod.findUnique({
        where: { id: dto.payoutMethodId },
      });
      if (!pm) throw new NotFoundException('Payout method not found');
      if (pm.userId !== userId) {
        throw new ForbiddenException('You do not own this payout method');
      }
      payoutMethodId = pm.id;
      snapshot = {
        type: pm.type,
        accountTitle: pm.accountTitle,
        accountNumber: pm.accountNumber,
        bankName: pm.bankName,
      };
    } else if (dto.accountTitle && dto.accountNumber) {
      snapshot = {
        type: dto.type || PayoutType.BANK,
        accountTitle: dto.accountTitle.trim(),
        accountNumber: dto.accountNumber.trim(),
        bankName: dto.type === PayoutType.BANK ? 'Bank Transfer (1Link)' : null,
      };
    } else {
      // Check if user has a default payout method
      const defaultPm = await this.prisma.payoutMethod.findFirst({
        where: { userId, isDefault: true },
      });
      if (defaultPm) {
        payoutMethodId = defaultPm.id;
        snapshot = {
          type: defaultPm.type,
          accountTitle: defaultPm.accountTitle,
          accountNumber: defaultPm.accountNumber,
          bankName: defaultPm.bankName,
        };
      } else {
        throw new BadRequestException(
          'Please select or provide a valid payout method for withdrawal',
        );
      }
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(100000 + Math.random() * 900000);
    const referenceId = `WD-${dateStr}-${rand}`;

    return this.prisma.$transaction(async (tx) => {
      // 1. Lock the withdrawal amount
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { lockedBalance: { increment: dto.amount } },
      });

      // 2. Create the withdrawal request
      const request = await tx.withdrawalRequest.create({
        data: {
          userId,
          walletId: wallet.id,
          payoutMethodId,
          amount: dto.amount,
          fee: 0,
          netAmount: dto.amount,
          status: WithdrawalStatus.REQUESTED,
          referenceId,
          payoutMethodSnapshot: snapshot,
        },
      });

      // 3. Log transaction
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: dto.amount,
          type: 'WITHDRAWAL_REQUESTED',
        },
      });

      return {
        message:
          'Withdrawal request submitted. Funds are reserved pending admin settlement.',
        withdrawalRequest: request,
      };
    });
  }

  async getUserWithdrawals(userId: string) {
    return this.prisma.withdrawalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { payoutMethod: true },
    });
  }

  async cancelWithdrawal(userId: string, id: string) {
    const request = await this.prisma.withdrawalRequest.findUnique({
      where: { id },
      include: { wallet: true },
    });

    if (!request) throw new NotFoundException('Withdrawal request not found');
    if (request.userId !== userId) {
      throw new ForbiddenException('You do not own this withdrawal request');
    }

    if (request.status !== WithdrawalStatus.REQUESTED) {
      throw new BadRequestException(
        'Only pending withdrawal requests can be cancelled',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Update status to CANCELLED
      const updated = await tx.withdrawalRequest.update({
        where: { id },
        data: { status: WithdrawalStatus.CANCELLED },
      });

      // 2. Unlock the funds
      await tx.wallet.update({
        where: { id: request.walletId },
        data: { lockedBalance: { decrement: request.amount } },
      });

      // 3. Log transaction
      await tx.walletTransaction.create({
        data: {
          walletId: request.walletId,
          amount: request.amount,
          type: 'WITHDRAWAL_CANCELLED',
        },
      });

      return {
        message: 'Withdrawal request cancelled. Funds restored to available balance.',
        withdrawalRequest: updated,
      };
    });
  }

  async getTransactionHistory(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    return this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
    });
  }
}

