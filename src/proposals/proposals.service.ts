import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { UpdateProposalStatusDto } from './dto/update-proposal-status.dto';

@Injectable()
export class ProposalsService {
  constructor(private readonly prisma: PrismaService) {}

  async submitProposal(freelancerId: string, dto: CreateProposalDto) {
    const job = await this.prisma.job.findUnique({ where: { id: dto.jobId } });
    if (!job) throw new NotFoundException('Job not found');

    const existing = await this.prisma.proposal.findFirst({
      where: { jobId: dto.jobId, freelancerId, status: 'PENDING' },
    });
    if (existing)
      throw new BadRequestException(
        'You already have a pending proposal for this job',
      );

    return this.prisma.proposal.create({
      data: {
        jobId: dto.jobId,
        freelancerId,
        coverLetter: dto.coverLetter,
        bidAmount: dto.bidAmount,
        deliveryDays: dto.deliveryDays,
      },
    });
  }

  async getProposalsByJob(userId: string, jobId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.clientId !== userId) {
      throw new ForbiddenException('Only the job owner can view proposals');
    }

    return this.prisma.proposal.findMany({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMyProposals(freelancerId: string) {
    return this.prisma.proposal.findMany({
      where: { freelancerId },
      include: {
        job: {
          select: { id: true, title: true, budget: true, clientId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(
    userId: string,
    proposalId: string,
    dto: UpdateProposalStatusDto,
  ) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { job: true },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.job.clientId !== userId) {
      throw new ForbiddenException(
        'Only the job owner can update proposal status',
      );
    }
    return this.prisma.proposal.update({
      where: { id: proposalId },
      data: { status: dto.status },
    });
  }

  async withdrawProposal(freelancerId: string, proposalId: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.freelancerId !== freelancerId) {
      throw new ForbiddenException('Not your proposal');
    }
    return this.prisma.proposal.update({
      where: { id: proposalId },
      data: { status: 'WITHDRAWN' },
    });
  }
}
