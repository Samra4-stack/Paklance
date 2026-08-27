import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { VerificationService } from './verification.service';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { ReviewVerificationDto } from './dto/review-verification.dto';

@ApiTags('Verification')
@ApiBearerAuth()
@Controller('verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @ApiOperation({
    summary: 'Submit verification document (authenticated users)',
  })
  @UseGuards(JwtAuthGuard)
  @Post()
  submitVerification(@Req() req: Request, @Body() dto: SubmitVerificationDto) {
    const userId = (req as any).user.id;
    return this.verificationService.submitVerification(userId, dto);
  }

  @ApiOperation({ summary: 'Get my verification status' })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMyVerification(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.verificationService.getMyVerification(userId);
  }

  @ApiOperation({ summary: 'Get all pending verifications (ADMIN only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('pending')
  getPendingVerifications() {
    return this.verificationService.getPendingVerifications();
  }

  @ApiOperation({ summary: 'Approve or reject a verification (ADMIN only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':userId/review')
  reviewVerification(
    @Param('userId') userId: string,
    @Body() dto: ReviewVerificationDto,
  ) {
    return this.verificationService.reviewVerification(userId, dto);
  }
}
