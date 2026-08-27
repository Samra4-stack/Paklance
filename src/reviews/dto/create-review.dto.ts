import {
  IsString,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';

export class CreateReviewDto {
  @IsString() @IsNotEmpty() contractId: string;
  @IsString() @IsNotEmpty() revieweeId: string;
  @IsInt() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsString() comment?: string;
}
