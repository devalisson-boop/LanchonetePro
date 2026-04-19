import { IsNumber, IsUUID, Min } from 'class-validator';

export class RecipeItemDto {
  @IsUUID()
  ingredientId!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;
}

