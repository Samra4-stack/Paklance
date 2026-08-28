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

      // 2. Find or create Specialist Wallet and increment available balance
      let specialistWallet = await tx.wallet.findFirst({
        where: { userId: milestone.contract.specialistId },
      });
      if (!specialistWallet) {
        specialistWallet = await tx.wallet.create({
          data: { userId: milestone.contract.specialistId, balance: 0 },
        });
      }

      await tx.wallet.update({
        where: { id: specialistWallet.id },
        data: { balance: { increment: milestone.amount } },
      });

      // 3. Record WalletTransaction for Specialist
      await tx.walletTransaction.create({
        data: {
          walletId: specialistWallet.id,
          amount: milestone.amount,
          type: 'MILESTONE_RELEASE',
        },
      });

      // 4. Log Ledger
      await tx.ledgerEntry.create({
        data: {
          escrowId: escrow.id,
          sourceWalletId: escrow.id,
          destinationWalletId: milestone.contract.specialistId,
          amount: milestone.amount,
          status: 'COMPLETED',
        },
      });

      // 5. Mark milestone RELEASED
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
        client: { select: { id: true, name: true, email: true, avatarUrl: true } },
        specialist: {
          select: {
            id: true,
            name: true,
            email: true,
            headline: true,
            avatarUrl: true,
          },
        },
        milestones: true,
        escrow: true,
        files: {
          include: {
            uploader: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        job: true,
        client: { select: { id: true, name: true, email: true, avatarUrl: true } },
        specialist: {
          select: {
            id: true,
            name: true,
            email: true,
            headline: true,
            avatarUrl: true,
          },
        },
        milestones: true,
        escrow: true,
        files: {
          include: {
            uploader: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }

  async getContractFiles(userId: string, contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    const isParticipant =
      contract.clientId === userId || contract.specialistId === userId;
    if (!isParticipant) {
      throw new ForbiddenException(
        'You do not have permission to view files for this contract',
      );
    }

    return this.prisma.contractFile.findMany({
      where: { contractId },
      include: {
        uploader: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadContractFile(
    userId: string,
    contractId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer?: Buffer;
      fileData?: string;
    },
  ) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    const isParticipant =
      contract.clientId === userId || contract.specialistId === userId;
    if (!isParticipant) {
      throw new ForbiddenException(
        'You do not have permission to upload files for this contract',
      );
    }

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File exceeds maximum allowed size of 5MB');
    }

    const allowedExtensions = [
      '.pdf',
      '.doc',
      '.docx',
      '.txt',
      '.zip',
      '.png',
      '.jpg',
      '.jpeg',
      '.webp',
    ];
    const ext = (file.originalname || '').toLowerCase();
    const isAllowed = allowedExtensions.some((allowed) => ext.endsWith(allowed));
    if (!isAllowed) {
      throw new BadRequestException(
        'Invalid file type. Allowed formats: PDF, DOCX, DOC, TXT, ZIP, PNG, JPG, JPEG, WEBP',
      );
    }

    let fileData = file.fileData;
    if (!fileData && file.buffer) {
      fileData = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    }
    if (!fileData) {
      throw new BadRequestException('File content cannot be empty');
    }

    const safeFilename = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    return this.prisma.contractFile.create({
      data: {
        contractId,
        uploaderId: userId,
        filename: safeFilename,
        originalName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        fileData,
      },
      include: {
        uploader: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
  }

  async getContractFile(userId: string, contractId: string, fileId: string) {
    const file = await this.prisma.contractFile.findUnique({
      where: { id: fileId },
      include: { contract: true },
    });
    if (!file || file.contractId !== contractId) {
      throw new NotFoundException('File not found');
    }

    const isParticipant =
      file.contract.clientId === userId ||
      file.contract.specialistId === userId;
    if (!isParticipant) {
      throw new ForbiddenException(
        'You do not have permission to access this contract file',
      );
    }

    return file;
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
