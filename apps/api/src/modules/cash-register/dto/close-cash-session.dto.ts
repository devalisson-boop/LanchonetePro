import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CloseCashSessionDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
