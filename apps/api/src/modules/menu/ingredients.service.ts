import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';

import type { AuthenticatedUser } from '../../shared/types/authenticated-user.type.js';
import { PG_POOL } from '../database/database.constants.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { CreateIngredientDto } from './dto/create-ingredient.dto.js';
import { UpdateIngredientDto } from './dto/update-ingredient.dto.js';

type IngredientRecord = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  description: string | null;
  supplier_name: string | null;
  cost_per_unit: string;
  quantity: string;
  minimum_quantity: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

@Injectable()
export class IngredientsService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(ProfilesService) private readonly profilesService: ProfilesService,
  ) {}

  async list(search?: string) {
    const result = await this.pool.query<IngredientRecord>(
      `
        select *
        from public.stock_items
        where ($1::text is null or name ilike '%' || $1 || '%' or coalesce(sku, '') ilike '%' || $1 || '%')
        order by name asc
      `,
      [search ?? null],
    );

    return result.rows.map((row) => this.toResponse(row));
  }

  async create(user: AuthenticatedUser, dto: CreateIngredientDto) {
    await this.profilesService.ensureProfile(user);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      const result = await client.query<IngredientRecord>(
        `
          insert into public.stock_items (
            name,
            sku,
            unit,
            description,
            supplier_name,
            cost_per_unit,
            quantity,
            minimum_quantity,
            is_active
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          returning *
        `,
        [
          dto.name,
          dto.sku ?? null,
          dto.unit,
          dto.description ?? null,
          dto.supplierName ?? null,
          dto.costPerUnit ?? 0,
          dto.stockQuantity ?? 0,
          dto.minimumStockLevel ?? 0,
          dto.isActive ?? true,
        ],
      );

      const ingredient = result.rows[0];
      const initialQuantity = Number(ingredient.quantity);

      if (initialQuantity > 0) {
        await client.query(
          `
            insert into public.stock_movements (
              stock_item_id,
              movement_type,
              quantity,
              reason,
              performed_by
            )
            values ($1, 'in', $2, $3, $4)
          `,
          [ingredient.id, initialQuantity, 'Estoque inicial do ingrediente.', user.id],
        );
      }

      await client.query('commit');
      return this.toResponse(ingredient);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateIngredientDto) {
    await this.profilesService.ensureProfile(user);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      const currentResult = await client.query<IngredientRecord>(
        `
          select *
          from public.stock_items
          where id = $1
          limit 1
          for update
        `,
        [id],
      );

      const current = currentResult.rows[0];

      if (!current) {
        throw new NotFoundException('Ingrediente nao encontrado.');
      }

      const result = await client.query<IngredientRecord>(
        `
          update public.stock_items
          set
            name = coalesce($2, name),
            sku = coalesce($3, sku),
            unit = coalesce($4, unit),
            description = coalesce($5, description),
            supplier_name = coalesce($6, supplier_name),
            cost_per_unit = coalesce($7, cost_per_unit),
            quantity = coalesce($8, quantity),
            minimum_quantity = coalesce($9, minimum_quantity),
            is_active = coalesce($10, is_active),
            updated_at = timezone('utc', now())
          where id = $1
          returning *
        `,
        [
          id,
          dto.name ?? null,
          dto.sku ?? null,
          dto.unit ?? null,
          dto.description ?? null,
          dto.supplierName ?? null,
          dto.costPerUnit ?? null,
          dto.stockQuantity ?? null,
          dto.minimumStockLevel ?? null,
          dto.isActive ?? null,
        ],
      );

      const updated = result.rows[0];
      const previousQuantity = Number(current.quantity);
      const nextQuantity = Number(updated.quantity);
      const quantityDelta = nextQuantity - previousQuantity;

      if (dto.stockQuantity !== undefined && quantityDelta !== 0) {
        await client.query(
          `
            insert into public.stock_movements (
              stock_item_id,
              movement_type,
              quantity,
              reason,
              performed_by
            )
            values ($1, $2, $3, $4, $5)
          `,
          [
            updated.id,
            quantityDelta > 0 ? 'in' : 'out',
            Math.abs(quantityDelta),
            'Ajuste manual de estoque pelo cadastro de ingrediente.',
            user.id,
          ],
        );
      }

      await client.query('commit');
      return this.toResponse(updated);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async remove(id: string) {
    const [recipeUsage, stockUsage] = await Promise.all([
      this.pool.query<{ exists: boolean }>(
        `
          select exists(
            select 1
            from public.product_ingredients
            where ingredient_id = $1
          ) as exists
        `,
        [id],
      ),
      this.pool.query<{ exists: boolean }>(
        `
          select exists(
            select 1
            from public.stock_movements
            where stock_item_id = $1
          ) as exists
        `,
        [id],
      ),
    ]);

    if (recipeUsage.rows[0]?.exists || stockUsage.rows[0]?.exists) {
      throw new ConflictException('Ingrediente ja vinculado a produtos ou movimentacoes. Inative em vez de excluir.');
    }

    const result = await this.pool.query(
      `
        delete from public.stock_items
        where id = $1
        returning id
      `,
      [id],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Ingrediente nao encontrado.');
    }

    return {
      success: true,
    };
  }

  private toResponse(row: IngredientRecord) {
    return {
      id: row.id,
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      description: row.description,
      supplierName: row.supplier_name,
      costPerUnit: Number(row.cost_per_unit),
      stockQuantity: Number(row.quantity),
      minimumStockLevel: Number(row.minimum_quantity),
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
