import { IsString, IsNotEmpty } from 'class-validator';

export class SubmitVerificationDto {
  @IsString() @IsNotEmpty() documentUrl: string;
}
