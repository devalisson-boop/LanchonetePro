import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import type { AuthenticatedUser } from '../../shared/types/authenticated-user.type.js';
import { PG_POOL } from '../database/database.constants.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

type ProfileRecord = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  auth_provider: string;
  role: 'owner' | 'manager' | 'cashier' | 'attendant' | 'kitchen';
  is_active: boolean;
  last_sign_in_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

@Injectable()
export class ProfilesService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async ensureProfile(user: AuthenticatedUser) {
    const result = await this.pool.query<ProfileRecord>(
      `
        insert into public.profiles (id, email, auth_provider, last_seen_at)
        values ($1, $2, 'email', timezone('utc', now()))
        on conflict (id)
        do update set
          email = excluded.email,
          last_seen_at = timezone('utc', now())
        returning *
      `,
      [user.id, user.email],
    );

    return this.toResponse(result.rows[0]);
  }

  async syncAuthUser(user: {
    id: string;
    email: string | null;
    fullName?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    authProvider?: string | null;
    lastSignInAt?: string | null;
  }) {
    const result = await this.pool.query<ProfileRecord>(
      `
        insert into public.profiles (
          id,
          email,
          full_name,
          phone,
          avatar_url,
          auth_provider,
          last_sign_in_at,
          last_seen_at
        )
        values ($1, $2, $3, $4, $5, coalesce($6, 'email'), $7, timezone('utc', now()))
        on conflict (id)
        do update set
          email = excluded.email,
          full_name = coalesce(excluded.full_name, public.profiles.full_name),
          phone = coalesce(excluded.phone, public.profiles.phone),
          avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
          auth_provider = coalesce(excluded.auth_provider, public.profiles.auth_provider),
          last_sign_in_at = coalesce(excluded.last_sign_in_at, public.profiles.last_sign_in_at),
          last_seen_at = timezone('utc', now())
        returning *
      `,
      [
        user.id,
        user.email,
        user.fullName ?? null,
        user.phone ?? null,
        user.avatarUrl ?? null,
        user.authProvider ?? 'email',
        user.lastSignInAt ?? null,
      ],
    );

    return this.toResponse(result.rows[0]);
  }

  async getById(userId: string) {
    const result = await this.pool.query<ProfileRecord>(
      `
        select *
        from public.profiles
        where id = $1
        limit 1
      `,
      [userId],
    );

    return result.rows[0] ? this.toResponse(result.rows[0]) : null;
  }

  async getMe(userId: string) {
    return this.getById(userId);
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    const result = await this.pool.query<ProfileRecord>(
      `
        update public.profiles
        set
          full_name = coalesce($2, full_name),
          phone = coalesce($3, phone),
          updated_at = timezone('utc', now())
        where id = $1
        returning *
      `,
      [userId, dto.fullName ?? null, dto.phone ?? null],
    );

    return result.rows[0] ? this.toResponse(result.rows[0]) : null;
  }

  private toResponse(profile: ProfileRecord) {
    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      phone: profile.phone,
      avatarUrl: profile.avatar_url,
      authProvider: profile.auth_provider,
      role: profile.role,
      isActive: profile.is_active,
      lastSignInAt: profile.last_sign_in_at,
      lastSeenAt: profile.last_seen_at,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    };
  }
}
