function getRuntimeEnv(key: string) {
  return window.__APP_ENV__?.[key] ?? import.meta.env[key];
}

export const env = {
  apiUrl: getRuntimeEnv('VITE_API_URL') ?? 'http://localhost:3000/api',
  supabaseUrl: getRuntimeEnv('VITE_SUPABASE_URL') ?? '',
  supabaseAnonKey: getRuntimeEnv('VITE_SUPABASE_ANON_KEY') ?? '',
};

export const isSupabaseConfigured =
  Boolean(env.supabaseUrl) &&
  Boolean(env.supabaseAnonKey) &&
  env.supabaseAnonKey !== 'coloque_sua_anon_key_aqui';

