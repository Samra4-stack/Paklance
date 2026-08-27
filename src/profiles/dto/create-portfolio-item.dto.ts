import { IsString, IsOptional, IsUrl } from 'class-validator';

export class CreatePortfolioItemDto {
  @IsString() title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUrl() imageUrl?: string;
  @IsOptional() @IsUrl() projectUrl?: string;
}
