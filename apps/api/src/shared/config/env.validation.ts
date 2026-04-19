import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumberString, IsString, IsUrl, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsEnum(['development', 'test', 'production'])
  NODE_ENV!: 'development' | 'test' | 'production';

  @IsNumberString()
  PORT!: string;

  @IsString()
  FRONTEND_URL!: string;

  @IsString()
  DATABASE_URL!: string;

  @IsUrl({
    require_tld: true,
  })
  SUPABASE_URL!: string;

  @IsString()
  SUPABASE_ANON_KEY!: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validated;
}
