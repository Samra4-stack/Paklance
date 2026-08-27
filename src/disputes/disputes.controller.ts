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
import { DisputesService } from './disputes.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';

@ApiTags('Disputes')
@ApiBearerAuth()
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @ApiOperation({
    summary: 'Raise a dispute for a contract (CONTRACT PARTICIPANTS only)',
  })
  @UseGuards(JwtAuthGuard)
  @Post()
  raiseDispute(@Req() req: Request, @Body() dto: CreateDisputeDto) {
    const userId = (req as any).user.id;
    return this.disputesService.raiseDispute(userId, dto);
  }

  @ApiOperation({ summary: 'Get my raised disputes' })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMyDisputes(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.disputesService.getMyDisputes(userId);
  }

  @ApiOperation({ summary: 'Get dispute by ID' })
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getDisputeById(@Param('id') id: string) {
    return this.disputesService.getDisputeById(id);
  }

  @ApiOperation({ summary: 'Resolve a dispute (ADMIN only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/resolve')
  resolveDispute(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    const userId = (req as any).user.id;
    return this.disputesService.resolveDispute(userId, id, dto);
  }
}
