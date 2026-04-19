import { IsOptional, IsPhoneNumber, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsPhoneNumber('BR')
  phone?: string;
}

