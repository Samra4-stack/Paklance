import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsArray,
  IsUrl,
  Min,
} from 'class-validator';
import { Availability } from '@prisma/client';

export class UpdateProfileDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsString() headline?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) skills?: string[];
  @IsOptional() @IsNumber() @Min(0) hourlyRate?: number;
  @IsOptional() @IsEnum(Availability) availability?: Availability;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() avatarUrl?: string;
}
