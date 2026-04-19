import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class OpenCashSessionDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
