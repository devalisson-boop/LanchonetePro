import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { IS_PUBLIC_ROUTE } from '../../shared/decorators/public.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-user.type.js';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly jwks;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ConfigService) configService: ConfigService,
  ) {
    const supabaseUrl = configService.getOrThrow<string>('SUPABASE_URL');
    this.jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authorizationHeader = request.headers.authorization;

    if (!authorizationHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token JWT nao informado.');
    }

    const token = authorizationHeader.replace('Bearer ', '').trim();

    try {
      const { payload } = await jwtVerify(token, this.jwks);
      const user: AuthenticatedUser = {
        id: String(payload.sub),
        email: typeof payload.email === 'string' ? payload.email : null,
        role: typeof payload.role === 'string' ? payload.role : null,
        token,
      };

      request.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Token JWT invalido para o projeto Supabase configurado.');
    }
  }
}
