import {
  IsNotEmpty,
  IsString,
  IsArray,
  ValidateNested,
  IsNumber,
  IsPositive,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMilestoneDto {
  @ApiProperty({ example: 'Phase 1: Backend Setup' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Initial setup of NestJS, Prisma & Auth' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 250.0 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;
}

export class CreateContractDto {
  @ApiProperty({ example: 'job-uuid-here' })
  @IsString()
  @IsNotEmpty()
  jobId: string;

  @ApiProperty({ example: 'specialist-user-uuid-here' })
  @IsString()
  @IsNotEmpty()
  specialistId: string;

  @ApiProperty({ type: [CreateMilestoneDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMilestoneDto)
  milestones: CreateMilestoneDto[];
}
