import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import { slugify } from '../../shared/utils/slugify.js';
import { PG_POOL } from '../database/database.constants.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

type CategoryRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

@Injectable()
export class CategoriesService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list() {
    const result = await this.pool.query<CategoryRecord>(
      `
        select *
        from public.categories
        order by name asc
      `,
    );

    return result.rows.map(this.toResponse);
  }

  async create(dto: CreateCategoryDto) {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    const result = await this.pool.query<CategoryRecord>(
      `
        insert into public.categories (name, slug, description, is_active)
        values ($1, $2, $3, $4)
        returning *
      `,
      [dto.name, slug, dto.description ?? null, dto.isActive ?? true],
    );

    return this.toResponse(result.rows[0]);
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const slug = dto.slug ? slugify(dto.slug) : dto.name ? slugify(dto.name) : null;
    const result = await this.pool.query<CategoryRecord>(
      `
        update public.categories
        set
          name = coalesce($2, name),
          slug = coalesce($3, slug),
          description = coalesce($4, description),
          is_active = coalesce($5, is_active),
          updated_at = timezone('utc', now())
        where id = $1
        returning *
      `,
      [id, dto.name ?? null, slug, dto.description ?? null, dto.isActive ?? null],
    );

    return result.rows[0] ? this.toResponse(result.rows[0]) : null;
  }

  private toResponse(category: CategoryRecord) {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      isActive: category.is_active,
      createdAt: category.created_at,
      updatedAt: category.updated_at,
    };
  }
}

