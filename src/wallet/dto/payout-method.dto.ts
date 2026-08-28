import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayoutType } from '@prisma/client';

export class CreatePayoutMethodDto {
  @ApiProperty({
    enum: PayoutType,
    example: PayoutType.BANK,
    description: 'Payout channel type',
  })
  @IsEnum(PayoutType)
  type: PayoutType;

  @ApiProperty({
    example: 'Areeba Batool',
    description: 'Official account beneficiary title',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  accountTitle: string;

  @ApiProperty({
    example: 'PK36SCBL0000001234567801',
    description: 'IBAN, Mobile wallet number or Raast ID',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  accountNumber: string;

  @ApiPropertyOptional({
    example: 'Standard Chartered Bank',
    description: 'Bank name if type is BANK',
  })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Set this as the default payout method',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
