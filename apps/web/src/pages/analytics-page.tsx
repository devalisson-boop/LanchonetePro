import { useEffect, useState } from 'react';

import { BackofficeHeader } from '../components/backoffice-header';
import { apiFetch } from '../lib/api';
import { useAuth } from '../providers/auth-provider';

type StatusKey = 'draft' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
type PaymentKey = 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'voucher' | 'unassigned';

type AnalyticsResponse = {
  period: {
    days: number;
    dateFrom: string;
    dateTo: string;
  };
  kpis: {
    grossRevenue: number;
    paidRevenue: number;
    totalOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    averageTicket: number;
    averagePrepMinutes: number;
    completionRate: number;
  };
  revenueSeries: Array<{
    date: string;
    label: string;
    revenue: number;
    orders: number;
  }>;
  statusBreakdown: Array<{
    status: string;
    count: number;
    revenue: number;
  }>;
  paymentBreakdown: Array<{
    paymentMethod: string;
    amount: number;
    orders: number;
  }>;
  topProducts: Array<{
    productId: string;
    productName: string;
    quantitySold: number;
    revenue: number;
  }>;
  hourlyPerformance: Array<{
    hour: number;
    orders: number;
    revenue: number;
  }>;
};

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const percent = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
});

const dayFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
});

const periodOptions = [7, 14, 30, 90] as const;

const statusLabels: Record<StatusKey, string> = {
  draft: 'Rascunho',
  confirmed: 'Confirmado',
  preparing: 'Em preparo',
  ready: 'Pronto',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

const paymentLabels: Record<PaymentKey, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  credit_card: 'Cartao de credito',
  debit_card: 'Cartao de debito',
  voucher: 'Voucher',
  unassigned: 'Sem definicao',
};

function formatRangeDate(value: string) {
  return dayFormatter.format(new Date(`${value}T12:00:00`));
}

function buildLineGeometry(data: Array<{ revenue: number }>, width: number, height: number, padding: number) {
  if (data.length === 0) {
    return { linePath: '', areaPath: '', points: [] as Array<{ x: number; y: number }> };
  }

  const maxValue = Math.max(...data.map((item) => item.revenue), 1);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const points = data.map((item, index) => {
    const x = data.length === 1 ? width / 2 : padding + (index / (data.length - 1)) * innerWidth;
    const y = padding + innerHeight - (item.revenue / maxValue) * innerHeight;
    return { x, y };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  const areaPath = `${linePath} L ${points[points.length - 1]?.x.toFixed(2)} ${(height - padding).toFixed(2)} L ${
    points[0]?.x.toFixed(2)
  } ${(height - padding).toFixed(2)} Z`;

  return { linePath, areaPath, points };
}

function TrendChart({
  data,
}: {
  data: AnalyticsResponse['revenueSeries'];
}) {
  if (data.length === 0) {
    return <div className="empty-state">Sem dados suficientes para desenhar a curva de faturamento.</div>;
  }

  const width = 720;
  const height = 260;
  const padding = 28;
  const maxValue = Math.max(...data.map((item) => item.revenue), 1);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelStep = data.length > 20 ? Math.ceil(data.length / 8) : 1;
  const { linePath, areaPath, points } = buildLineGeometry(data, width, height, padding);

  return (
    <div className="trend-chart">
      <svg className="trend-chart__svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafico de faturamento">
        <defs>
          <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(212, 99, 31, 0.38)" />
            <stop offset="100%" stopColor="rgba(212, 99, 31, 0.03)" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => {
          const y = padding + (1 - tick) * (height - padding * 2);
          return (
            <g key={tick}>
              <line className="trend-chart__grid" x1={padding} x2={width - padding} y1={y} y2={y} />
              <text className="trend-chart__label" x={8} y={y + 4}>
                {currency.format(maxValue * tick)}
              </text>
            </g>
          );
        })}

        <path className="trend-chart__area" d={areaPath} />
        <path className="trend-chart__line" d={linePath} />

        {points.map((point, index) => (
          <g key={data[index]?.date}>
            <circle className="trend-chart__point" cx={point.x} cy={point.y} r={4} />
            {index % labelStep === 0 || index === data.length - 1 ? (
              <text className="trend-chart__x-label" x={point.x} y={height - 6} textAnchor="middle">
                {data[index]?.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

function HourlyBars({
  data,
}: {
  data: AnalyticsResponse['hourlyPerformance'];
}) {
  const maxRevenue = Math.max(...data.map((item) => item.revenue), 1);

  return (
    <div className="hourly-chart">
      {data.map((item) => (
        <div className="hourly-chart__item" key={item.hour}>
          <div className="hourly-chart__bar-wrap">
            <div
              className="hourly-chart__bar"
              style={{ height: `${item.revenue > 0 ? (item.revenue / maxRevenue) * 100 : 3}%` }}
              title={`${String(item.hour).padStart(2, '0')}h | ${currency.format(item.revenue)}`}
            />
          </div>
          <strong>{String(item.hour).padStart(2, '0')}</strong>
          <span>{item.orders}</span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<(typeof periodOptions)[number]>(14);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);

  async function loadAnalytics(nextDays: (typeof periodOptions)[number]) {
    try {
      setLoading(true);
      setError(null);

      const data = await apiFetch<AnalyticsResponse>(`dashboard/analytics?days=${nextDays}`);
      setAnalytics(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar o analytics.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session) {
      return;
    }

    void loadAnalytics(days);
  }, [session, days]);

  const bestDay =
    analytics && analytics.revenueSeries.length > 0
      ? analytics.revenueSeries.reduce((currentBest, item) => (item.revenue > currentBest.revenue ? item : currentBest))
      : null;
  const topPayment =
    analytics && analytics.paymentBreakdown.length > 0
      ? analytics.paymentBreakdown.reduce((currentBest, item) => (item.amount > currentBest.amount ? item : currentBest))
      : null;
  const topProduct = analytics?.topProducts[0] ?? null;
  const busiestHour =
    analytics && analytics.hourlyPerformance.length > 0
      ? analytics.hourlyPerformance.reduce((currentBest, item) => (item.orders > currentBest.orders ? item : currentBest))
      : null;

  return (
    <main className="dashboard-shell">
      <BackofficeHeader
        title="Relatorios e Analytics"
        subtitle="Acompanhe faturamento, operacao, pagamentos e os produtos que puxam o resultado."
        onRefresh={() => void loadAnalytics(days)}
      />

      <section className="tabs-panel">
        <div className="tabs-switcher tabs-switcher--compact">
          {periodOptions.map((period) => (
            <button
              className={days === period ? 'tab tab--active' : 'tab'}
              key={period}
              onClick={() => setDays(period)}
              type="button"
            >
              {period} dias
            </button>
          ))}
        </div>
      </section>

      {error && <div className="banner banner--error">{error}</div>}

      {loading || !analytics ? (
        <div className="screen-state">Carregando graficos e indicadores analiticos...</div>
      ) : (
        <>
          <section className="stats-grid stats-grid--six">
            <div className="stat-card stat-card--gold">
              <span>Faturamento bruto</span>
              <strong>{currency.format(analytics.kpis.grossRevenue)}</strong>
            </div>
            <div className="stat-card stat-card--green">
              <span>Recebido</span>
              <strong>{currency.format(analytics.kpis.paidRevenue)}</strong>
            </div>
            <div className="stat-card stat-card--blue">
              <span>Pedidos</span>
              <strong>{analytics.kpis.totalOrders}</strong>
            </div>
            <div className="stat-card stat-card--green">
              <span>Ticket medio</span>
              <strong>{currency.format(analytics.kpis.averageTicket)}</strong>
            </div>
            <div className="stat-card stat-card--blue">
              <span>Taxa de conclusao</span>
              <strong>{percent.format(analytics.kpis.completionRate)}</strong>
            </div>
            <div className="stat-card stat-card--red">
              <span>Preparo medio</span>
              <strong>{analytics.kpis.averagePrepMinutes.toFixed(0)} min</strong>
            </div>
          </section>

          <section className="content-grid analytics-grid--wide">
            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Serie Temporal</p>
                  <h2>Faturamento por dia</h2>
                </div>
                <span className="muted">
                  {formatRangeDate(analytics.period.dateFrom)} ate {formatRangeDate(analytics.period.dateTo)}
                </span>
              </div>

              <TrendChart data={analytics.revenueSeries} />
            </article>

            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Destaques</p>
                  <h2>Leitura executiva</h2>
                </div>
              </div>

              <div className="management-list">
                <div className="management-card">
                  <strong>Melhor dia</strong>
                  <p className="muted">
                    {bestDay
                      ? `${bestDay.label} com ${currency.format(bestDay.revenue)} e ${bestDay.orders} pedidos`
                      : 'Sem movimentacao no periodo.'}
                  </p>
                </div>

                <div className="management-card">
                  <strong>Forma de pagamento lider</strong>
                  <p className="muted">
                    {topPayment
                      ? `${paymentLabels[topPayment.paymentMethod as PaymentKey] ?? topPayment.paymentMethod} com ${currency.format(topPayment.amount)}`
                      : 'Sem pagamentos registrados.'}
                  </p>
                </div>

                <div className="management-card">
                  <strong>Produto campeao</strong>
                  <p className="muted">
                    {topProduct
                      ? `${topProduct.productName} com ${currency.format(topProduct.revenue)} e ${topProduct.quantitySold.toFixed(0)} unidades`
                      : 'Sem vendas no periodo.'}
                  </p>
                </div>

                <div className="management-card">
                  <strong>Horario de pico</strong>
                  <p className="muted">
                    {busiestHour
                      ? `${String(busiestHour.hour).padStart(2, '0')}h com ${busiestHour.orders} pedidos`
                      : 'Sem operacao registrada.'}
                  </p>
                </div>
              </div>
            </article>
          </section>

          <section className="content-grid analytics-grid--wide">
            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Status</p>
                  <h2>Distribuicao dos pedidos</h2>
                </div>
              </div>

              <div className="bar-chart">
                {analytics.statusBreakdown.map((item) => {
                  const maxValue = Math.max(...analytics.statusBreakdown.map((entry) => entry.count), 1);
                  const width = `${(item.count / maxValue) * 100}%`;

                  return (
                    <div className="bar-chart__row" key={item.status}>
                      <div className="bar-chart__copy">
                        <strong>{statusLabels[item.status as StatusKey] ?? item.status}</strong>
                        <span>
                          {item.count} pedidos | {currency.format(item.revenue)}
                        </span>
                      </div>
                      <div className="bar-chart__track">
                        <div className="bar-chart__fill bar-chart__fill--accent" style={{ width }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Pagamento</p>
                  <h2>Mix de recebimento</h2>
                </div>
              </div>

              <div className="bar-chart">
                {analytics.paymentBreakdown.map((item) => {
                  const maxValue = Math.max(...analytics.paymentBreakdown.map((entry) => entry.amount), 1);
                  const width = `${(item.amount / maxValue) * 100}%`;

                  return (
                    <div className="bar-chart__row" key={item.paymentMethod}>
                      <div className="bar-chart__copy">
                        <strong>{paymentLabels[item.paymentMethod as PaymentKey] ?? item.paymentMethod}</strong>
                        <span>
                          {currency.format(item.amount)} | {item.orders} pedidos
                        </span>
                      </div>
                      <div className="bar-chart__track">
                        <div className="bar-chart__fill bar-chart__fill--green" style={{ width }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          </section>

          <section className="content-grid analytics-grid--wide">
            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Produtos</p>
                  <h2>Top vendas do periodo</h2>
                </div>
              </div>

              <div className="bar-chart">
                {analytics.topProducts.length === 0 ? (
                  <div className="empty-state">Nenhuma venda encontrada para o periodo.</div>
                ) : (
                  analytics.topProducts.map((item) => {
                    const maxValue = Math.max(...analytics.topProducts.map((entry) => entry.revenue), 1);
                    const width = `${(item.revenue / maxValue) * 100}%`;

                    return (
                      <div className="bar-chart__row" key={item.productId}>
                        <div className="bar-chart__copy">
                          <strong>{item.productName}</strong>
                          <span>
                            {currency.format(item.revenue)} | {item.quantitySold.toFixed(0)} un
                          </span>
                        </div>
                        <div className="bar-chart__track">
                          <div className="bar-chart__fill bar-chart__fill--blue" style={{ width }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </article>

            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Horario</p>
                  <h2>Ritmo da operacao</h2>
                </div>
              </div>

              <HourlyBars data={analytics.hourlyPerformance} />
            </article>
          </section>
        </>
      )}
    </main>
  );
}
