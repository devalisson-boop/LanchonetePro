import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

import { PG_POOL } from './database.constants.js';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return new Pool({
          connectionString: configService.getOrThrow<string>('DATABASE_URL'),
          ssl: {
            rejectUnauthorized: false,
          },
          max: 10,
          idleTimeoutMillis: 30000,
        });
      },
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}

