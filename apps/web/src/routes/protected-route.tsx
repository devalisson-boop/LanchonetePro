import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../providers/auth-provider';

export function ProtectedRoute() {
  const { loading, session } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="screen-state">Carregando sessao...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

