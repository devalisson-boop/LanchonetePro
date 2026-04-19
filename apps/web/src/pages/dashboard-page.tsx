import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import snackHeroImage from '../assets/snack-hero-premium.jpg';
import { BackofficeHeader } from '../components/backoffice-header';
import { StatCard } from '../components/stat-card';
import { apiFetch } from '../lib/api';
import { useAuth } from '../providers/auth-provider';

type DashboardResponse = {
  kpis: {
    todayRevenue: number;
    monthRevenue: number;
    openOrders: number;
    activeProducts: number;
    lowStockProducts: number;
  };
  recentOrders: Array<{
    id: string;
    referenceCode: string;
    customerName: string | null;
    status: string;
    totalAmount: number;
    createdAt: string;
  }>;
};

type Product = {
  id: string;
  name: string;
  categoryName: string | null;
  price: number;
  stockQuantity: number;
  minimumStockLevel: number;
  isAvailable: boolean;
};

type Order = {
  id: string;
  referenceCode: string;
  customerName: string | null;
  status: string;
  totalAmount: number;
  itemCount: number;
  createdAt: string;
};

type MeResponse = {
  user: {
    email: string | null;
  };
  profile: {
    fullName: string | null;
    role: string;
  };
};

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function DashboardPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const [summary, catalog, orderList, currentUser] = await Promise.all([
          apiFetch<DashboardResponse>('dashboard/summary'),
          apiFetch<Product[]>('products'),
          apiFetch<Order[]>('orders'),
          apiFetch<MeResponse>('auth/me'),
        ]);

        if (cancelled) {
          return;
        }

        setDashboard(summary);
        setProducts(catalog);
        setOrders(orderList);
        setMe(currentUser);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar o dashboard.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [session]);

  const lowStock = products.filter((product) => product.stockQuantity <= product.minimumStockLevel);
  const roleLabel = me?.profile.role
    ? me.profile.role.charAt(0).toUpperCase() + me.profile.role.slice(1)
    : 'Operador';

  return (
    <main className="dashboard-shell">
      <BackofficeHeader
        title="Lanchonete Pro"
        subtitle={`Centro de comando da operacao | Perfil ${roleLabel}`}
        onRefresh={() => window.location.reload()}
      />

      {loading && <div className="screen-state">Carregando indicadores e operacao...</div>}
      {error && <div className="banner banner--error">{error}</div>}

      {dashboard && (
        <>
          <section className="dashboard-showcase">
            <div className="dashboard-showcase__copy">
              <p className="eyebrow">Experiencia de marca</p>
              <h2>Visual com fome de venda e operacao no controle.</h2>
              <p className="muted">
                Uma apresentacao mais viva para transmitir velocidade, sabor e profissionalismo sem pesar a rotina do
                caixa, da cozinha e do atendimento.
              </p>

              <div className="dashboard-showcase__metrics">
                <div className="dashboard-showcase__metric">
                  <strong>{dashboard.kpis.openOrders}</strong>
                  <span>pedidos acompanhados ao vivo</span>
                </div>
                <div className="dashboard-showcase__metric">
                  <strong>{dashboard.kpis.activeProducts}</strong>
                  <span>produtos ativos no cardapio</span>
                </div>
                <div className="dashboard-showcase__metric">
                  <strong>{currency.format(dashboard.kpis.todayRevenue)}</strong>
                  <span>resultado parcial do dia</span>
                </div>
              </div>
            </div>

            <div className="dashboard-showcase__visual">
              <span className="dashboard-showcase__badge">Combo em destaque</span>
              <img
                alt="Combo profissional de lanche com hamburger, batatas fritas e refrigerante"
                className="dashboard-showcase__image"
                decoding="async"
                loading="lazy"
                src={snackHeroImage}
              />
              <div className="dashboard-showcase__ring dashboard-showcase__ring--one" />
              <div className="dashboard-showcase__ring dashboard-showcase__ring--two" />
            </div>
          </section>

          <section className="stats-grid">
            <StatCard label="Faturamento Hoje" value={currency.format(dashboard.kpis.todayRevenue)} accent="gold" />
            <StatCard label="Faturamento no Mes" value={currency.format(dashboard.kpis.monthRevenue)} accent="green" />
            <StatCard label="Pedidos em Aberto" value={String(dashboard.kpis.openOrders)} accent="blue" />
            <StatCard label="Produtos Ativos" value={String(dashboard.kpis.activeProducts)} accent="gold" />
            <StatCard label="Baixo Estoque" value={String(dashboard.kpis.lowStockProducts)} accent="red" />
          </section>

          <section className="content-grid">
            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Pedidos Recentes</p>
                  <h2>Fluxo da cozinha e atendimento</h2>
                </div>
                <div className="inline-actions">
                  <span className="muted">{dashboard.recentOrders.length} no painel rapido</span>
                  <Link className="secondary-button ghost-button--link" to="/analytics">
                    Ver analytics
                  </Link>
                  <Link className="ghost-button ghost-button--link" to="/pedidos">
                    Abrir central
                  </Link>
                  <Link className="secondary-button ghost-button--link" to="/caixa">
                    Ir para caixa
                  </Link>
                </div>
              </div>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Referencia</th>
                      <th>Cliente</th>
                      <th>Status</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.recentOrders.map((order) => (
                      <tr key={order.id}>
                        <td>{order.referenceCode}</td>
                        <td>{order.customerName || 'Balcao'}</td>
                        <td>
                          <span className={`status-chip status-chip--${order.status}`}>{order.status}</span>
                        </td>
                        <td>{currency.format(order.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Catalogo</p>
                  <h2>Produtos com foco no estoque</h2>
                </div>
                <div className="inline-actions">
                  <span className="muted">{products.length} itens cadastrados</span>
                  <Link className="ghost-button ghost-button--link" to="/produtos">
                    Gerenciar
                  </Link>
                  <Link className="secondary-button ghost-button--link" to="/estoque">
                    Ver estoque
                  </Link>
                </div>
              </div>

              <div className="product-list">
                {products.slice(0, 8).map((product) => {
                  const isLow = product.stockQuantity <= product.minimumStockLevel;

                  return (
                    <div className={isLow ? 'product-card product-card--alert' : 'product-card'} key={product.id}>
                      <div>
                        <strong>{product.name}</strong>
                        <span>{product.categoryName || 'Sem categoria'}</span>
                      </div>
                      <div>
                        <strong>{currency.format(product.price)}</strong>
                        <span>
                          Estoque {product.stockQuantity} {isLow ? '| Repor' : ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          </section>

          <section className="content-grid">
            <article className="panel panel--accent">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Analytics</p>
                  <h2>Leitura executiva da operacao</h2>
                </div>
                <Link className="ghost-button ghost-button--link" to="/analytics">
                  Abrir central
                </Link>
              </div>

              <div className="management-list">
                <div className="management-card">
                  <strong>Visao consolidada</strong>
                  <p className="muted">
                    Acompanhe curva de faturamento, mix de pagamento, status dos pedidos e produtos lideres em uma
                    unica tela.
                  </p>
                </div>

                <div className="management-card">
                  <strong>Operacao orientada por dados</strong>
                  <p className="muted">
                    Use os graficos para descobrir pico de horario, gargalos de preparo e itens que mais puxam receita.
                  </p>
                </div>
              </div>
            </article>

            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Pedidos</p>
                  <h2>Ultimas comandas registradas</h2>
                </div>
                <Link className="ghost-button ghost-button--link" to="/pedidos">
                  Operar pedidos
                </Link>
              </div>

              <div className="order-stack">
                {orders.slice(0, 6).map((order) => (
                  <div className="order-card" key={order.id}>
                    <div>
                      <strong>{order.referenceCode}</strong>
                      <span>{order.customerName || 'Cliente de balcao'}</span>
                    </div>
                    <div>
                      <strong>{currency.format(order.totalAmount)}</strong>
                      <span>{order.itemCount} itens</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel panel--accent">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Alerta Operacional</p>
                  <h2>Itens que pedem reposicao</h2>
                </div>
                <Link className="ghost-button ghost-button--link" to="/estoque">
                  Abrir central
                </Link>
              </div>

              {lowStock.length === 0 ? (
                <div className="screen-state screen-state--compact">Nenhum produto com estoque critico agora.</div>
              ) : (
                <ul className="alert-list">
                  {lowStock.map((product) => (
                    <li key={product.id}>
                      <strong>{product.name}</strong>
                      <span>
                        Estoque atual {product.stockQuantity} | minimo {product.minimumStockLevel}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>

          <footer className="dashboard-credit">
            <span>Desenvolvimento do site</span>
            <strong>Alisson da Rocha Trindade</strong>
            <p>
              Projeto desenhado para unir operacao, caixa, estoque e analytics com uma experiencia profissional,
              moderna e pronta para evoluir com a lanchonete.
            </p>
          </footer>
        </>
      )}
    </main>
  );
}
