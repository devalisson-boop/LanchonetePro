import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import { env } from '../lib/env';
import { useAuth } from '../providers/auth-provider';

export function BackofficeHeader({
  title,
  subtitle,
  onRefresh,
  actions,
}: {
  title: string;
  subtitle: string;
  onRefresh?: () => void;
  actions?: ReactNode;
}) {
  const { signOut } = useAuth();

  return (
    <header className="topbar topbar--backoffice">
      <div className="topbar__main">
        <div>
          <p className="eyebrow">Painel Operacional</p>
          <h1>{title}</h1>
          <p className="topbar__subtitle">{subtitle}</p>
        </div>

        <nav className="backoffice-nav" aria-label="Navegacao principal">
          <NavLink className={({ isActive }) => (isActive ? 'nav-pill nav-pill--active' : 'nav-pill')} to="/">
            Dashboard
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'nav-pill nav-pill--active' : 'nav-pill')} to="/analytics">
            Analytics
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'nav-pill nav-pill--active' : 'nav-pill')} to="/caixa">
            Caixa
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'nav-pill nav-pill--active' : 'nav-pill')} to="/estoque">
            Estoque
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? 'nav-pill nav-pill--active' : 'nav-pill')}
            to="/pedidos"
          >
            Pedidos
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? 'nav-pill nav-pill--active' : 'nav-pill')}
            to="/produtos"
          >
            Produtos
          </NavLink>
        </nav>
      </div>

      <div className="topbar__actions">
        <span className="endpoint-pill">{env.apiUrl}</span>
        {onRefresh && (
          <button className="ghost-button" onClick={onRefresh} type="button">
            Atualizar
          </button>
        )}
        {actions}
        <button className="primary-button" onClick={() => void signOut()} type="button">
          Sair
        </button>
      </div>
    </header>
  );
}
