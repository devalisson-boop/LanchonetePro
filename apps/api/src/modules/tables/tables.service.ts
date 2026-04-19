import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import { PG_POOL } from '../database/database.constants.js';

type TableRecord = {
  id: string;
  name: string;
  seats: number;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning';
  created_at: string;
  updated_at: string;
};

@Injectable()
export class TablesService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list() {
    const result = await this.pool.query<TableRecord>(
      `
        select *
        from public.customer_tables
        order by name asc
      `,
    );

    return result.rows.map((table) => ({
      id: table.id,
      name: table.name,
      seats: table.seats,
      status: table.status,
      createdAt: table.created_at,
      updatedAt: table.updated_at,
    }));
  }
}

