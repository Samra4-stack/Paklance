import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';

@Injectable()
export class DisputesService {
  constructor(private readonly prisma: PrismaService) {}

  async raiseDispute(userId: string, dto: CreateDisputeDto) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: dto.contractId },
    });
    if (!contract) throw new NotFoundException('Contract not found');

    const isParticipant =
      contract.clientId === userId || contract.specialistId === userId;
    if (!isParticipant)
      throw new ForbiddenException('You are not part of this contract');

    return this.prisma.dispute.create({
      data: {
        contractId: dto.contractId,
        raisedByUserId: userId,
        reason: dto.reason,
      },
    });
  }

  async getMyDisputes(userId: string) {
    return this.prisma.dispute.findMany({
      where: { raisedByUserId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDisputeById(id: string) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id } });
    if (!dispute) throw new NotFoundException('Dispute not found');
    return dispute;
  }

  async resolveDispute(
    adminUserId: string,
    id: string,
    dto: ResolveDisputeDto,
  ) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id } });
    if (!dispute) throw new NotFoundException('Dispute not found');

    return this.prisma.dispute.update({
      where: { id },
      data: {
        status: dto.status,
        resolution: dto.resolution,
        resolvedByUserId: adminUserId,
      },
    });
  }
}
