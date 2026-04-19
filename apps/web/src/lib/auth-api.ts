import { publicApiFetch } from './api';

export type AuthApiResponse = {
  user: {
    id: string;
    email: string | null;
    emailConfirmedAt: string | null;
  };
  profile: {
    id: string;
    email: string | null;
    fullName: string | null;
    phone: string | null;
    avatarUrl: string | null;
    authProvider: string;
    role: string;
    isActive: boolean;
    lastSignInAt: string | null;
    lastSeenAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  session: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    expiresAt: number | null;
    tokenType: string;
  } | null;
  requiresEmailConfirmation: boolean;
};

export function loginRequest(email: string, password: string) {
  return publicApiFetch<AuthApiResponse>('auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
    }),
  });
}

export function registerRequest(payload: {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}) {
  return publicApiFetch<AuthApiResponse>('auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
