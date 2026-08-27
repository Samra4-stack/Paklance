import { IsOptional, IsString, IsNumber, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { Availability } from '@prisma/client';

export class SearchProfilesDto {
  @IsOptional() @IsString() skill?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @Type(() => Number) @IsNumber() minRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maxRate?: number;
  @IsOptional() @IsEnum(Availability) availability?: Availability;
}
