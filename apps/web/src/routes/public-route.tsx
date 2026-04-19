import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../providers/auth-provider';

export function PublicRoute() {
  const { loading, session } = useAuth();
  const location = useLocation();
  const redirectTo =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';

  if (loading) {
    return <div className="screen-state">Carregando sessao...</div>;
  }

  if (session) {
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
}
