import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import snackHeroImage from '../assets/snack-hero-premium.jpg';
import { isSupabaseConfigured } from '../lib/supabase';

export function AuthShell({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <main className="auth-shell">
      <section className="hero-panel">
        <div className="hero-panel__badge">Lanchonete Pro</div>
        <h1>Comanda, cozinha e caixa no mesmo ritmo.</h1>
        <p>
          Uma central profissional para acelerar atendimento, controlar estoque e acompanhar faturamento com cara de
          lanchonete de alto nivel.
        </p>
        <ul className="hero-panel__list">
          <li>Painel pensado para balcao, delivery, retirada e mesas</li>
          <li>Caixa, estoque, cardapio e pedidos conectados no mesmo fluxo</li>
          <li>Leitura operacional com indicadores e analytics prontos para uso</li>
        </ul>

        <div className="hero-panel__showcase">
          <div className="hero-panel__chips">
            <span className="hero-chip">Burger artesanal</span>
            <span className="hero-chip">Batata crocante</span>
            <span className="hero-chip">Atendimento veloz</span>
          </div>

          <figure className="snack-showcase">
            <img
              alt="Combo premium de hamburger, batata frita e refrigerante"
              className="snack-showcase__image"
              decoding="async"
              src={snackHeroImage}
            />
          </figure>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-card__header auth-card__header--links">
          <NavLink className={({ isActive }) => (isActive ? 'tab tab--active' : 'tab')} to="/login">
            Entrar
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'tab tab--active' : 'tab')} to="/register">
            Cadastrar
          </NavLink>
        </div>

        {!isSupabaseConfigured && (
          <div className="banner banner--warning">
            Preencha a variavel <code>VITE_SUPABASE_ANON_KEY</code> em <code>apps/web/.env</code>
            com a chave publica do Supabase para ativar a persistencia da sessao no navegador.
          </div>
        )}

        <div className="auth-copy">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>

        {children}
      </section>
    </main>
  );
}
