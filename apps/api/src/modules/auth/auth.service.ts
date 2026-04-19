import {
  BadGatewayException,
  Inject,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthenticatedUser } from '../../shared/types/authenticated-user.type.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import type {
  SupabaseAuthPayload,
  SupabaseAuthResponse,
  SupabaseAuthUser,
  SupabaseSession,
} from './types/supabase-auth.types.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(ProfilesService) private readonly profilesService: ProfilesService,
  ) {}

  async register(dto: RegisterDto) {
    const response = await this.requestSupabaseAuth<SupabaseAuthPayload>('/signup', {
      method: 'POST',
      body: {
        email: dto.email,
        password: dto.password,
        data: {
          full_name: dto.fullName,
          phone: dto.phone ?? null,
        },
      },
    });

    return this.toAuthResponse(await this.normalizeAuthResponse(response), {
      fallbackPhone: dto.phone ?? null,
    });
  }

  async login(dto: LoginDto) {
    const response = await this.requestSupabaseAuth<SupabaseAuthPayload>('/token?grant_type=password', {
      method: 'POST',
      body: {
        email: dto.email,
        password: dto.password,
      },
    });

    return this.toAuthResponse(await this.normalizeAuthResponse(response), {});
  }

  async refresh(dto: RefreshTokenDto) {
    const response = await this.requestSupabaseAuth<SupabaseAuthPayload>('/token?grant_type=refresh_token', {
      method: 'POST',
      body: {
        refresh_token: dto.refreshToken,
      },
    });

    return this.toAuthResponse(await this.normalizeAuthResponse(response), {});
  }

  async logout(accessToken: string) {
    await this.requestSupabaseAuth<void>('/logout', {
      method: 'POST',
      accessToken,
    });

    return {
      success: true,
    };
  }

  async me(user: AuthenticatedUser) {
    const profile = await this.profilesService.ensureProfile(user);

    return {
      user,
      profile,
    };
  }

  private async toAuthResponse(
    response: SupabaseAuthResponse,
    options: {
      fallbackPhone?: string | null;
    },
  ) {
    const authUser = response.user;

    if (!authUser) {
      throw new InternalServerErrorException('Supabase retornou autenticacao sem usuario associado.');
    }

    const profile = await this.profilesService.syncAuthUser({
      id: authUser.id,
      email: authUser.email,
      fullName: authUser.user_metadata?.full_name ?? null,
      phone: authUser.phone ?? authUser.user_metadata?.phone ?? options.fallbackPhone ?? null,
      avatarUrl: authUser.user_metadata?.avatar_url ?? null,
      authProvider: authUser.app_metadata?.provider ?? 'email',
      lastSignInAt: authUser.last_sign_in_at ?? null,
    });

    return {
      user: {
        id: authUser.id,
        email: authUser.email,
        emailConfirmedAt: authUser.email_confirmed_at ?? null,
      },
      profile,
      session: response.session
        ? this.mapSession(response.session)
        : null,
      requiresEmailConfirmation: response.session === null,
    };
  }

  private async normalizeAuthResponse(payload: SupabaseAuthPayload): Promise<SupabaseAuthResponse> {
    const session = this.extractSession(payload);
    let user = this.extractUser(payload);

    if (!user && session?.user) {
      user = session.user;
    }

    if (!user && session?.access_token) {
      user = await this.requestSupabaseAuth<SupabaseAuthUser>('/user', {
        method: 'GET',
        accessToken: session.access_token,
      });
    }

    return {
      user,
      session,
    };
  }

  private mapSession(session: SupabaseSession) {
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in,
      expiresAt: session.expires_at ?? null,
      tokenType: session.token_type,
    };
  }

  private extractSession(payload: SupabaseAuthPayload): SupabaseSession | null {
    if (payload.session) {
      return payload.session;
    }

    if (
      typeof payload.access_token === 'string'
      && typeof payload.refresh_token === 'string'
      && typeof payload.expires_in === 'number'
      && typeof payload.token_type === 'string'
    ) {
      return {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        expires_in: payload.expires_in,
        expires_at: typeof payload.expires_at === 'number' ? payload.expires_at : undefined,
        token_type: payload.token_type,
        user: this.isSupabaseAuthUser(payload.user) ? payload.user : undefined,
      };
    }

    return null;
  }

  private extractUser(payload: SupabaseAuthPayload): SupabaseAuthUser | null {
    if (this.isSupabaseAuthUser(payload.user)) {
      return payload.user;
    }

    if (this.isSupabaseAuthUser(payload)) {
      return payload;
    }

    return null;
  }

  private isSupabaseAuthUser(value: unknown): value is SupabaseAuthUser {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Record<string, unknown>;

    return typeof candidate.id === 'string'
      && (typeof candidate.email === 'string' || candidate.email === null || typeof candidate.phone === 'string');
  }

  private async requestSupabaseAuth<T>(
    path: string,
    options: {
      method: 'POST' | 'GET';
      body?: Record<string, unknown>;
      accessToken?: string;
    },
  ) {
    const supabaseUrl = this.configService.getOrThrow<string>('SUPABASE_URL');
    const supabaseAnonKey = this.configService.getOrThrow<string>('SUPABASE_ANON_KEY');
    let response: Response;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
    };

    if (options.accessToken) {
      headers.Authorization = `Bearer ${options.accessToken}`;
    }

    try {
      response = await fetch(`${supabaseUrl}/auth/v1${path}`, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch {
      throw new BadGatewayException('Nao foi possivel conectar ao Supabase Auth.');
    }

    if (!response.ok) {
      const payload = await this.parseResponsePayload(response);
      const message = this.getSupabaseErrorMessage(payload);

      if (response.status === HttpStatus.UNAUTHORIZED || response.status === HttpStatus.FORBIDDEN) {
        throw new UnauthorizedException(message);
      }

      if (response.status >= 400 && response.status < 500) {
        throw new HttpException(message, response.status);
      }

      throw new BadGatewayException(message);
    }

    if (response.status === HttpStatus.NO_CONTENT) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async parseResponsePayload(response: Response) {
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      return response.json() as Promise<Record<string, unknown>>;
    }

    return {
      message: await response.text(),
    };
  }

  private getSupabaseErrorMessage(payload: Record<string, unknown>) {
    const candidates = [
      payload.msg,
      payload.message,
      payload.error_description,
      payload.error,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }

    return 'Falha ao se comunicar com o Supabase Auth.';
  }
}
