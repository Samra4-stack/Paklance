import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto } from './dto/contract.dto';
import { ContractStatus, MilestoneStatus } from '@prisma/client';

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async createContract(clientId: string, dto: CreateContractDto) {
    const job = await this.prisma.job.findUnique({ where: { id: dto.jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.clientId !== clientId)
      throw new ForbiddenException('Only job creator can initiate contract');

    const specialist = await this.prisma.user.findUnique({
      where: { id: dto.specialistId },
    });
    if (!specialist) throw new NotFoundException('Specialist user not found');

    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.create({
        data: {
          jobId: dto.jobId,
          clientId,
          specialistId: dto.specialistId,
          status: ContractStatus.DRAFT,
          milestones: {
            create: dto.milestones.map((m) => ({
              title: m.title,
              description: m.description,
              amount: m.amount,
            })),
          },
        },
        include: { milestones: true },
      });

      // Create empty Escrow instance linked to contract & user
      await tx.escrow.create({
        data: {
          contractId: contract.id,
          userId: clientId,
          balance: 0,
        },
      });

      return contract;
    });
  }

  async fundContract(contractId: string, clientId: string, amount: number) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { escrow: true },
    });

    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.clientId !== clientId)
      throw new ForbiddenException('Only client can fund this contract');

    return this.prisma.$transaction(async (tx) => {
      const updatedEscrow = await tx.escrow.update({
        where: { contractId },
        data: {
          balance: { increment: amount },
        },
      });

      await tx.ledgerEntry.create({
        data: {
          escrowId: updatedEscrow.id,
          sourceWalletId: clientId,
          destinationWalletId: updatedEscrow.id,
          amount,
          status: 'COMPLETED',
        },
      });

      const updatedContract = await tx.contract.update({
        where: { id: contractId },
        data: { status: ContractStatus.FUNDED },
        include: { escrow: true, milestones: true },
      });

      return updatedContract;
    });
  }

  async releaseMilestone(milestoneId: string, clientId: string) {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { contract: { include: { escrow: true } } },
    });

    if (!milestone) throw new NotFoundException('Milestone not found');
    if (milestone.contract.clientId !== clientId)
      throw new ForbiddenException('Only client can release milestone funds');

    const escrow = milestone.contract.escrow;
    if (!escrow || Number(escrow.balance) < Number(milestone.amount)) {
      throw new BadRequestException(
        'Insufficient funds in contract Escrow to release milestone',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Deduct escrow balance
      const updatedEscrow = await tx.escrow.update({
        where: { id: escrow.id },
        data: { balance: { decrement: milestone.amount } },
      });

      // 2. Log Ledger
      await tx.ledgerEntry.create({
        data: {
          escrowId: escrow.id,
          sourceWalletId: escrow.id,
          destinationWalletId: milestone.contract.specialistId,
          amount: milestone.amount,
          status: 'COMPLETED',
        },
      });

      // 3. Mark milestone RELEASED
      const updatedMilestone = await tx.milestone.update({
        where: { id: milestoneId },
        data: { status: MilestoneStatus.RELEASED },
      });

      return {
        milestone: updatedMilestone,
        remainingEscrowBalance: updatedEscrow.balance,
      };
    });
  }

  async findUserContracts(userId: string) {
    return this.prisma.contract.findMany({
      where: {
        OR: [{ clientId: userId }, { specialistId: userId }],
      },
      include: {
        job: true,
        client: { select: { id: true, email: true } },
        specialist: { select: { id: true, email: true } },
        milestones: true,
        escrow: true,
      },
    });
  }

  async findOne(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        job: true,
        client: { select: { id: true, email: true } },
        specialist: { select: { id: true, email: true } },
        milestones: true,
        escrow: true,
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }

  async startContract(contractId: string, specialistId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.specialistId !== specialistId) {
      throw new ForbiddenException(
        'Only the specialist can start the contract',
      );
    }
    if (contract.status !== ContractStatus.FUNDED) {
      throw new BadRequestException(
        'Contract must be FUNDED before it can be started',
      );
    }
    return this.prisma.contract.update({
      where: { id: contractId },
      data: { status: ContractStatus.IN_PROGRESS },
    });
  }

  async completeContract(contractId: string, clientId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.clientId !== clientId) {
      throw new ForbiddenException(
        'Only the client can mark the contract as complete',
      );
    }
    if (contract.status !== ContractStatus.IN_PROGRESS) {
      throw new BadRequestException(
        'Contract must be IN_PROGRESS to be marked as completed',
      );
    }
    return this.prisma.contract.update({
      where: { id: contractId },
      data: { status: ContractStatus.COMPLETED },
    });
  }

  async closeContract(contractId: string, userId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    const isParticipant =
      contract.clientId === userId || contract.specialistId === userId;
    if (!isParticipant)
      throw new ForbiddenException(
        'You are not a participant in this contract',
      );
    const closableStatuses: ContractStatus[] = [
      ContractStatus.COMPLETED,
      ContractStatus.DISPUTED,
    ];
    if (!closableStatuses.includes(contract.status)) {
      throw new BadRequestException(
        'Contract can only be closed after it is COMPLETED or DISPUTED',
      );
    }
    return this.prisma.contract.update({
      where: { id: contractId },
      data: { status: ContractStatus.CLOSED },
    });
  }
}
