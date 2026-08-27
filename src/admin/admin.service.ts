import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [
      totalUsers,
      totalJobs,
      totalContracts,
      totalProposals,
      openDisputes,
      pendingVerifications,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.job.count(),
      this.prisma.contract.count(),
      this.prisma.proposal.count(),
      this.prisma.dispute.count({ where: { status: 'OPEN' } }),
      this.prisma.verification.count({ where: { status: 'PENDING' } }),
    ]);

    return {
      totalUsers,
      totalJobs,
      totalContracts,
      totalProposals,
      openDisputes,
      pendingVerifications,
    };
  }

  async getAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        headline: true,
        availability: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        headline: true,
        bio: true,
        skills: true,
        availability: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getAllDisputes() {
    return this.prisma.dispute.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getAllVerifications() {
    return this.prisma.verification.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
