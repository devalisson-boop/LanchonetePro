import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { loginRequest, registerRequest, type AuthApiResponse } from '../lib/auth-api';

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<AuthApiResponse>;
  signUp: (payload: { email: string; password: string; fullName: string; phone?: string }) => Promise<AuthApiResponse>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();

      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    }

    loadSession();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const response = await loginRequest(email, password);
    await syncSupabaseSession(response);
    return response;
  }

  async function signUp(payload: { email: string; password: string; fullName: string; phone?: string }) {
    const response = await registerRequest(payload);
    await syncSupabaseSession(response);
    return response;
  }

  async function signOut() {
    try {
      await apiFetch<{ success: boolean }>('auth/logout', {
        method: 'POST',
      });
    } catch {
      // Mesmo com falha remota, limpamos a sessao local para nao prender o usuario.
    }

    await supabase.auth.signOut();
  }

  async function syncSupabaseSession(response: AuthApiResponse) {
    if (!response.session) {
      return;
    }

    if (!isSupabaseConfigured) {
      throw new Error('Preencha a VITE_SUPABASE_ANON_KEY com a chave publica do Supabase para persistir a sessao JWT no navegador.');
    }

    const { error } = await supabase.auth.setSession({
      access_token: response.session.accessToken,
      refresh_token: response.session.refreshToken,
    });

    if (error) {
      throw error;
    }
  }

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth precisa ser usado dentro de AuthProvider.');
  }

  return context;
}
