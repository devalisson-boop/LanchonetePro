import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

import { slugify } from '../../shared/utils/slugify.js';
import { PG_POOL } from '../database/database.constants.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { RecipeItemDto } from './dto/recipe-item.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

type ProductRecord = {
  id: string;
  category_id: string | null;
  category_name: string | null;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  cost_price: string | null;
  stock_quantity: string;
  minimum_stock_level: string;
  image_url: string | null;
  is_available: boolean;
  created_at: string;
  updated_at: string;
};

type ProductIngredientRecord = {
  product_id: string;
  ingredient_id: string;
  ingredient_name: string;
  ingredient_sku: string | null;
  unit: string;
  quantity: string;
  cost_per_unit: string;
  ingredient_is_active: boolean;
};

@Injectable()
export class ProductsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(search?: string) {
    const result = await this.pool.query<ProductRecord>(
      `
        select
          p.*,
          c.name as category_name
        from public.products p
        left join public.categories c on c.id = p.category_id
        where ($1::text is null or p.name ilike '%' || $1 || '%')
        order by p.name asc
      `,
      [search ?? null],
    );

    return this.hydrateProducts(result.rows);
  }

  async findById(id: string) {
    const result = await this.pool.query<ProductRecord>(
      `
        select
          p.*,
          c.name as category_name
        from public.products p
        left join public.categories c on c.id = p.category_id
        where p.id = $1
        limit 1
      `,
      [id],
    );

    const products = await this.hydrateProducts(result.rows);
    const product = products[0];

    if (!product) {
      throw new NotFoundException('Produto nao encontrado.');
    }

    return product;
  }

  async create(dto: CreateProductDto) {
    const client = await this.pool.connect();

    try {
      await client.query('begin');
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
      const result = await client.query<ProductRecord>(
      `
        insert into public.products (
          category_id,
          name,
          slug,
          description,
          price,
          cost_price,
          stock_quantity,
          minimum_stock_level,
          image_url,
          is_available
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        returning *, null::text as category_name
      `,
      [
        dto.categoryId ?? null,
        dto.name,
        slug,
        dto.description ?? null,
        dto.price,
        dto.costPrice ?? null,
        dto.stockQuantity ?? 0,
        dto.minimumStockLevel ?? 0,
        dto.imageUrl ?? null,
        dto.isAvailable ?? true,
      ],
    );

      await this.syncRecipe(client, result.rows[0].id, dto.recipe ?? []);
      await client.query('commit');
      return this.findById(result.rows[0].id);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(id: string, dto: UpdateProductDto) {
    const client = await this.pool.connect();

    try {
      await client.query('begin');
    const slug = dto.slug ? slugify(dto.slug) : dto.name ? slugify(dto.name) : null;
      const result = await client.query<ProductRecord>(
      `
        update public.products
        set
          category_id = coalesce($2, category_id),
          name = coalesce($3, name),
          slug = coalesce($4, slug),
          description = coalesce($5, description),
          price = coalesce($6, price),
          cost_price = coalesce($7, cost_price),
          stock_quantity = coalesce($8, stock_quantity),
          minimum_stock_level = coalesce($9, minimum_stock_level),
          image_url = coalesce($10, image_url),
          is_available = coalesce($11, is_available),
          updated_at = timezone('utc', now())
        where id = $1
        returning *, null::text as category_name
      `,
      [
        id,
        dto.categoryId ?? null,
        dto.name ?? null,
        slug,
        dto.description ?? null,
        dto.price ?? null,
        dto.costPrice ?? null,
        dto.stockQuantity ?? null,
        dto.minimumStockLevel ?? null,
        dto.imageUrl ?? null,
        dto.isAvailable ?? null,
      ],
    );

      if (!result.rows[0]) {
        throw new NotFoundException('Produto nao encontrado.');
      }

      if (dto.recipe !== undefined) {
        await this.syncRecipe(client, id, dto.recipe);
      }

      await client.query('commit');
      return this.findById(id);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async remove(id: string) {
    const orderUsage = await this.pool.query<{ exists: boolean }>(
      `
        select exists(
          select 1
          from public.order_items
          where product_id = $1
        ) as exists
      `,
      [id],
    );

    if (orderUsage.rows[0]?.exists) {
      throw new ConflictException('Produto ja foi utilizado em pedidos. Marque como indisponivel em vez de excluir.');
    }

    const result = await this.pool.query(
      `
        delete from public.products
        where id = $1
        returning id
      `,
      [id],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Produto nao encontrado.');
    }

    return {
      success: true,
    };
  }

  private toResponse(product: ProductRecord) {
    return {
      id: product.id,
      categoryId: product.category_id,
      categoryName: product.category_name,
      name: product.name,
      slug: product.slug,
      description: product.description,
      price: Number(product.price),
      costPrice: product.cost_price ? Number(product.cost_price) : null,
      stockQuantity: Number(product.stock_quantity),
      minimumStockLevel: Number(product.minimum_stock_level),
      imageUrl: product.image_url,
      isAvailable: product.is_available,
      createdAt: product.created_at,
      updatedAt: product.updated_at,
    };
  }

  private async hydrateProducts(products: ProductRecord[]) {
    if (products.length === 0) {
      return [];
    }

    const productIds = products.map((product) => product.id);
    const ingredientResult = await this.pool.query<ProductIngredientRecord>(
      `
        select
          pi.product_id,
          si.id as ingredient_id,
          si.name as ingredient_name,
          si.sku as ingredient_sku,
          si.unit,
          pi.quantity,
          si.cost_per_unit,
          si.is_active as ingredient_is_active
        from public.product_ingredients pi
        inner join public.stock_items si on si.id = pi.ingredient_id
        where pi.product_id = any($1::uuid[])
        order by si.name asc
      `,
      [productIds],
    );

    const grouped = new Map<
      string,
      Array<{
        ingredientId: string;
        ingredientName: string;
        ingredientSku: string | null;
        unit: string;
        quantity: number;
        costPerUnit: number;
        totalCost: number;
        isActive: boolean;
      }>
    >();

    for (const ingredient of ingredientResult.rows) {
      const recipeItem = {
        ingredientId: ingredient.ingredient_id,
        ingredientName: ingredient.ingredient_name,
        ingredientSku: ingredient.ingredient_sku,
        unit: ingredient.unit,
        quantity: Number(ingredient.quantity),
        costPerUnit: Number(ingredient.cost_per_unit),
        totalCost: Number(ingredient.quantity) * Number(ingredient.cost_per_unit),
        isActive: ingredient.ingredient_is_active,
      };

      const current = grouped.get(ingredient.product_id) ?? [];
      current.push(recipeItem);
      grouped.set(ingredient.product_id, current);
    }

    return products.map((product) => {
      const recipe = grouped.get(product.id) ?? [];

      return {
        ...this.toResponse(product),
        recipe,
        recipeCost: recipe.reduce((sum, item) => sum + item.totalCost, 0),
      };
    });
  }

  private async syncRecipe(client: PoolClient, productId: string, recipe: RecipeItemDto[]) {
    const normalizedRecipe = this.normalizeRecipe(recipe);
    const ingredientIds = normalizedRecipe.map((item) => item.ingredientId);

    if (ingredientIds.length > 0) {
      const ingredientsResult = await client.query<{ id: string }>(
        `
          select id
          from public.stock_items
          where id = any($1::uuid[])
        `,
        [ingredientIds],
      );

      if (ingredientsResult.rows.length !== ingredientIds.length) {
        throw new NotFoundException('Um ou mais ingredientes informados nao existem.');
      }
    }

    await client.query(
      `
        delete from public.product_ingredients
        where product_id = $1
      `,
      [productId],
    );

    if (normalizedRecipe.length === 0) {
      return;
    }

    const values: Array<string | number> = [];
    const placeholders = normalizedRecipe.map((item, index) => {
      const offset = index * 3;
      values.push(productId, item.ingredientId, item.quantity);
      return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
    });

    await client.query(
      `
        insert into public.product_ingredients (
          product_id,
          ingredient_id,
          quantity
        )
        values ${placeholders.join(', ')}
      `,
      values,
    );
  }

  private normalizeRecipe(recipe: RecipeItemDto[]) {
    const seen = new Set<string>();
    const normalized: RecipeItemDto[] = [];

    for (const item of recipe) {
      if (seen.has(item.ingredientId)) {
        throw new ConflictException('Nao repita o mesmo ingrediente mais de uma vez na ficha tecnica.');
      }

      seen.add(item.ingredientId);
      normalized.push(item);
    }

    return normalized;
  }
}
