import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateWallet(userId: string) {
    let wallet = await this.prisma.wallet.findFirst({ where: { userId } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({ data: { userId } });
    }
    return wallet;
  }

  async getBalance(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    return { balance: wallet.balance };
  }

  async deposit(userId: string, dto: DepositDto) {
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

  async withdraw(userId: string, dto: WithdrawDto) {
    const wallet = await this.getOrCreateWallet(userId);

    if (Number(wallet.balance) < dto.amount) {
      throw new BadRequestException('Insufficient balance');
    }

    const updatedWallet = await this.prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: dto.amount } },
    });

    await this.prisma.walletTransaction.create({
      data: { walletId: wallet.id, amount: dto.amount, type: 'WITHDRAWAL' },
    });

    return updatedWallet;
  }

  async getTransactionHistory(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    return this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
    });
  }
}
