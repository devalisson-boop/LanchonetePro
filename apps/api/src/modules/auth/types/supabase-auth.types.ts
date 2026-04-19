export type SupabaseAuthUser = {
  id: string;
  email: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  phone?: string | null;
  last_sign_in_at?: string | null;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
    phone?: string;
  } | null;
  app_metadata?: {
    provider?: string;
  } | null;
};

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user?: SupabaseAuthUser;
};

export type SupabaseAuthResponse = {
  user: SupabaseAuthUser | null;
  session: SupabaseSession | null;
};

export type SupabaseAuthPayload = Partial<SupabaseAuthUser> &
  Partial<SupabaseSession> & {
    user?: SupabaseAuthUser | null;
    session?: SupabaseSession | null;
  };
