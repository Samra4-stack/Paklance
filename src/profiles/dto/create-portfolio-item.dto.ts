import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreatePortfolioItemDto {
  @IsString() @IsNotEmpty() title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() projectUrl?: string;
}
