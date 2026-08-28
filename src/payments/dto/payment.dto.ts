import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentProvider, PaymentStatus } from '@prisma/client';

export class InitiatePaymentDto {
  @ApiProperty({ example: 5000, description: 'Amount in PKR' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({
    enum: PaymentProvider,
    example: PaymentProvider.JAZZCASH,
    description: 'Selected Pakistani payment provider',
  })
  @IsEnum(PaymentProvider)
  provider: PaymentProvider;

  @ApiPropertyOptional({
    description: 'Contract ID for milestone/contract funding',
  })
  @IsOptional()
  @IsString()
  contractId?: string;

  @ApiPropertyOptional({ description: 'Optional payment description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Custom frontend return URL' })
  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class SandboxSimulateDto {
  @ApiProperty({ description: 'Unique payment reference ID' })
  @IsString()
  @IsNotEmpty()
  referenceId: string;

  @ApiPropertyOptional({
    enum: [PaymentStatus.COMPLETED, PaymentStatus.FAILED],
    default: PaymentStatus.COMPLETED,
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;
}
