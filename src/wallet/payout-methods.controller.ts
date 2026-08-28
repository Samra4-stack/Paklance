import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PayoutMethodsService } from './payout-methods.service';
import { CreatePayoutMethodDto } from './dto/payout-method.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Payout Methods')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet/payout-methods')
export class PayoutMethodsController {
  constructor(private readonly payoutMethodsService: PayoutMethodsService) {}

  @ApiOperation({ summary: 'Add a new payout method (Bank, JazzCash, Easypaisa, Raast)' })
  @Post()
  addPayoutMethod(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePayoutMethodDto,
  ) {
    return this.payoutMethodsService.addPayoutMethod(userId, dto);
  }

  @ApiOperation({ summary: 'Get all saved payout methods for current user' })
  @Get()
  getPayoutMethods(@CurrentUser('id') userId: string) {
    return this.payoutMethodsService.getPayoutMethods(userId);
  }

  @ApiOperation({ summary: 'Set a payout method as default' })
  @Patch(':id/default')
  setDefault(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.payoutMethodsService.setDefault(userId, id);
  }

  @ApiOperation({ summary: 'Delete a payout method' })
  @Delete(':id')
  remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.payoutMethodsService.remove(userId, id);
  }
}
