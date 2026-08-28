import { IsNumber, Min, IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayoutType } from '@prisma/client';

export class WithdrawDto {
  @ApiProperty({ example: 2500, description: 'Withdrawal amount in PKR' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ description: 'ID of saved PayoutMethod' })
  @IsOptional()
  @IsString()
  payoutMethodId?: string;

  @ApiPropertyOptional({ enum: PayoutType, description: 'Direct payout type' })
  @IsOptional()
  @IsEnum(PayoutType)
  type?: PayoutType;

  @ApiPropertyOptional({ enum: PayoutType, description: 'Payout channel type (alias for type)' })
  @IsOptional()
  @IsEnum(PayoutType)
  channel?: PayoutType;

  @ApiPropertyOptional({ description: 'Account title if not using saved method' })
  @IsOptional()
  @IsString()
  accountTitle?: string;

  @ApiPropertyOptional({ description: 'Account/IBAN number if not using saved method' })
  @IsOptional()
  @IsString()
  accountNumber?: string;
}

