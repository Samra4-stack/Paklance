import { IsString, IsNumber, IsInt, Min, IsNotEmpty } from 'class-validator';

export class CreateProposalDto {
  @IsString() @IsNotEmpty() jobId: string;
  @IsString() @IsNotEmpty() coverLetter: string;
  @IsNumber() @Min(1) bidAmount: number;
  @IsInt() @Min(1) deliveryDays: number;
}
