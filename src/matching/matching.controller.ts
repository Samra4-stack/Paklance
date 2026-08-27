import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MatchingService } from './matching.service';

@ApiTags('Matching')
@Controller('matching')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @ApiOperation({ summary: 'Find matching freelancers for a job' })
  @ApiQuery({
    name: 'skills',
    required: false,
    description: 'Comma-separated list of required skills',
  })
  @Get('job/:jobId')
  findMatchesForJob(
    @Param('jobId') jobId: string,
    @Query('skills') skills?: string,
  ) {
    const requiredSkills = skills ? skills.split(',').map((s) => s.trim()) : [];
    return this.matchingService.findMatchesForJob(jobId, requiredSkills);
  }

  @ApiOperation({ summary: 'Find matching jobs for the logged-in freelancer' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  findMatchesForMe(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.matchingService.findMatchesForFreelancer(userId);
  }
}
