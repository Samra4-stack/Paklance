import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async createReview(reviewerId: string, dto: CreateReviewDto) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: dto.contractId },
    });
    if (!contract) throw new NotFoundException('Contract not found');

    if (contract.status !== 'COMPLETED') {
      throw new BadRequestException('You can only review completed contracts');
    }

    const isParticipant =
      contract.clientId === reviewerId || contract.specialistId === reviewerId;
    if (!isParticipant)
      throw new ForbiddenException('You are not part of this contract');

    const existing = await this.prisma.review.findFirst({
      where: { contractId: dto.contractId, reviewerId },
    });
    if (existing)
      throw new BadRequestException('You have already reviewed this contract');

    return this.prisma.review.create({
      data: {
        contractId: dto.contractId,
        reviewerId,
        revieweeId: dto.revieweeId,
        rating: dto.rating,
        comment: dto.comment,
      },
    });
  }

  async getReviewsForUser(userId: string) {
    return this.prisma.review.findMany({
      where: { revieweeId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAverageRating(userId: string) {
    const result = await this.prisma.review.aggregate({
      where: { revieweeId: userId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    return {
      averageRating: result._avg.rating ?? 0,
      totalReviews: result._count.rating,
    };
  }
}
