import { IsEnum } from 'class-validator';
import { VerificationStatus } from '@prisma/client';

export class ReviewVerificationDto {
  @IsEnum(VerificationStatus) status: VerificationStatus;
}
