import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { ReviewVerificationDto } from './dto/review-verification.dto';

@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async submitVerification(userId: string, dto: SubmitVerificationDto) {
    const existing = await this.prisma.verification.findUnique({
      where: { userId },
    });
    if (existing) {
      return this.prisma.verification.update({
        where: { userId },
        data: { documentUrl: dto.documentUrl, status: 'PENDING' },
      });
    }
    return this.prisma.verification.create({
      data: { userId, documentUrl: dto.documentUrl },
    });
  }

  async getMyVerification(userId: string) {
    const record = await this.prisma.verification.findUnique({
      where: { userId },
    });
    if (!record) throw new NotFoundException('No verification record found');
    return record;
  }

  async getPendingVerifications() {
    return this.prisma.verification.findMany({ where: { status: 'PENDING' } });
  }

  async reviewVerification(userId: string, dto: ReviewVerificationDto) {
    const record = await this.prisma.verification.findUnique({
      where: { userId },
    });
    if (!record) throw new NotFoundException('Verification record not found');
    if (record.status !== 'PENDING')
      throw new BadRequestException('Already reviewed');

    return this.prisma.verification.update({
      where: { userId },
      data: { status: dto.status },
    });
  }
}
