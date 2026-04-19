import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsEnum(['draft', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'])
  status!: 'draft' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

