import { IsString, IsNotEmpty } from 'class-validator';

export class CreateDisputeDto {
  @IsString() @IsNotEmpty() contractId: string;
  @IsString() @IsNotEmpty() reason: string;
}
