import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateCashTransactionDto {
  @IsEnum(['sale', 'refund', 'cash_in', 'cash_out'])
  transactionType!: 'sale' | 'refund' | 'cash_in' | 'cash_out';

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsEnum(['cash', 'pix', 'credit_card', 'debit_card', 'voucher'])
  paymentMethod?: 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'voucher';

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
