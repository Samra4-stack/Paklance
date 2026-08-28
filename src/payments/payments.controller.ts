import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto, SandboxSimulateDto } from './dto/payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Payments & Gateways')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiOperation({ summary: 'Initiate payment checkout (CLIENT only)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLIENT)
  @Post('checkout/initiate')
  initiatePayment(
    @CurrentUser('id') userId: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.paymentsService.initiatePayment(userId, dto);
  }

  @ApiOperation({ summary: 'Get payment status by reference ID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('status/:referenceId')
  getPaymentStatus(
    @CurrentUser('id') userId: string,
    @Param('referenceId') referenceId: string,
  ) {
    return this.paymentsService.getPaymentStatus(userId, referenceId);
  }

  @ApiOperation({ summary: 'JazzCash IPN Webhook & Return URL Callback' })
  @Post('jazzcash/callback')
  jazzCashCallback(
    @Body() payload: Record<string, any>,
    @Headers() headers: Record<string, any>,
  ) {
    return this.paymentsService.handleJazzCashCallback(payload, headers);
  }

  @ApiOperation({ summary: 'Easypaisa IPN Webhook & Return URL Callback' })
  @Post('easypaisa/callback')
  easypaisaCallback(
    @Body() payload: Record<string, any>,
    @Headers() headers: Record<string, any>,
  ) {
    return this.paymentsService.handleEasypaisaCallback(payload, headers);
  }

  @ApiOperation({
    summary:
      'Simulate sandbox payment (NON-PRODUCTION / TEST ENVIRONMENTS ONLY)',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('sandbox/simulate')
  simulateSandboxPayment(
    @CurrentUser('id') userId: string,
    @Body() dto: SandboxSimulateDto,
  ) {
    return this.paymentsService.simulateSandboxPayment(userId, dto);
  }
}
