import { useEffect, useState, type FormEvent } from 'react';

import { BackofficeHeader } from '../components/backoffice-header';
import { apiFetch } from '../lib/api';
import { useAuth } from '../providers/auth-provider';

type AlertStatus = 'out' | 'low' | 'inactive';
type MovementType = 'in' | 'out' | 'adjustment';

type IngredientOption = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
};

type IngredientAlert = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  stockQuantity: number;
  minimumStockLevel: number;
  costPerUnit: number;
  supplierName: string | null;
  isActive: boolean;
  shortageQuantity: number;
  inventoryValue: number;
  affectedProductsCount: number;
  alertStatus: AlertStatus;
  lastMovementAt: string | null;
};

type ProductRisk = {
  id: string;
  name: string;
  categoryName: string | null;
  issueCount: number;
  issueIngredients: string[];
};

type InactiveRecipeIngredient = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  supplierName: string | null;
  productsCount: number;
  productNames: string[];
};

type StockMovement = {
  id: string;
  itemId: string;
  itemName: string;
  sku: string | null;
  unit: string;
  movementType: MovementType;
  quantity: number;
  movementValue: number;
  reason: string | null;
  orderReferenceCode: string | null;
  performedByName: string | null;
  createdAt: string;
};

type StockOverview = {
  kpis: {
    activeIngredients: number;
    lowStockIngredients: number;
    outOfStockIngredients: number;
    suppliersCount: number;
    inventoryValue: number;
    productsAtRisk: number;
  };
  alerts: {
    outOfStockIngredients: IngredientAlert[];
    lowStockIngredients: IngredientAlert[];
    productsAtRisk: ProductRisk[];
    inactiveRecipeIngredients: InactiveRecipeIngredient[];
  };
  recentMovements: StockMovement[];
};

type StockReport = {
  summary: {
    movementCount: number;
    incomingQuantity: number;
    outgoingQuantity: number;
    adjustmentQuantity: number;
    incomingValue: number;
    outgoingValue: number;
    adjustmentValue: number;
    inventoryValue: number;
    lowStockIngredients: number;
    outOfStockIngredients: number;
  };
  movements: StockMovement[];
  criticalItems: IngredientAlert[];
};

type ReportFilters = {
  dateFrom: string;
  dateTo: string;
  movementType: '' | MovementType;
  itemId: string;
};

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function toInputDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultFilters(): ReportFilters {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);

  return {
    dateFrom: toInputDate(start),
    dateTo: toInputDate(end),
    movementType: '',
    itemId: '',
  };
}

function buildReportPath(filters: ReportFilters) {
  const params = new URLSearchParams();

  if (filters.dateFrom) {
    params.set('dateFrom', filters.dateFrom);
  }

  if (filters.dateTo) {
    params.set('dateTo', filters.dateTo);
  }

  if (filters.movementType) {
    params.set('movementType', filters.movementType);
  }

  if (filters.itemId) {
    params.set('itemId', filters.itemId);
  }

  return `stock/report?${params.toString()}`;
}

function alertLabel(status: AlertStatus) {
  switch (status) {
    case 'out':
      return 'Sem estoque';
    case 'low':
      return 'Baixo estoque';
    case 'inactive':
      return 'Inativo na receita';
    default:
      return status;
  }
}

function movementLabel(type: MovementType) {
  switch (type) {
    case 'in':
      return 'Entrada';
    case 'out':
      return 'Saida';
    case 'adjustment':
      return 'Ajuste';
    default:
      return type;
  }
}

export function StockPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<StockOverview | null>(null);
  const [report, setReport] = useState<StockReport | null>(null);
  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);
  const [filters, setFilters] = useState<ReportFilters>(defaultFilters);

  async function loadOverview() {
    const [overviewData, ingredientData] = await Promise.all([
      apiFetch<StockOverview>('stock/overview'),
      apiFetch<IngredientOption[]>('ingredients'),
    ]);

    setOverview(overviewData);
    setIngredients(ingredientData);
  }

  async function loadReport(nextFilters = filters) {
    setReportLoading(true);

    try {
      const reportData = await apiFetch<StockReport>(buildReportPath(nextFilters));
      setReport(reportData);
    } finally {
      setReportLoading(false);
    }
  }

  async function loadAll() {
    try {
      setLoading(true);
      setError(null);

      await Promise.all([loadOverview(), loadReport(filters)]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar a central de estoque.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session) {
      return;
    }

    void loadAll();
  }, [session]);

  async function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await loadReport(filters);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'Falha ao consultar o relatorio de estoque.');
    }
  }

  async function handleResetFilters() {
    const nextFilters = defaultFilters();
    setFilters(nextFilters);
    setError(null);

    try {
      await loadReport(nextFilters);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'Falha ao recarregar o relatorio de estoque.');
    }
  }

  return (
    <main className="dashboard-shell">
      <BackofficeHeader
        title="Central de Estoque"
        subtitle="Acompanhe alertas de reposicao, riscos no cardapio e o historico completo das movimentacoes."
        onRefresh={() => void loadAll()}
      />

      {error && <div className="banner banner--error">{error}</div>}

      {loading || !overview || !report ? (
        <div className="screen-state">Carregando alertas e relatorios de estoque...</div>
      ) : (
        <>
          <section className="stats-grid">
            <div className="stat-card stat-card--gold">
              <span>Insumos ativos</span>
              <strong>{overview.kpis.activeIngredients}</strong>
            </div>
            <div className="stat-card stat-card--red">
              <span>Baixo estoque</span>
              <strong>{overview.kpis.lowStockIngredients}</strong>
            </div>
            <div className="stat-card stat-card--red">
              <span>Sem estoque</span>
              <strong>{overview.kpis.outOfStockIngredients}</strong>
            </div>
            <div className="stat-card stat-card--blue">
              <span>Produtos em risco</span>
              <strong>{overview.kpis.productsAtRisk}</strong>
            </div>
            <div className="stat-card stat-card--green">
              <span>Valor em estoque</span>
              <strong>{currency.format(overview.kpis.inventoryValue)}</strong>
            </div>
          </section>

          <section className="content-grid">
            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Alertas</p>
                  <h2>Reposicao imediata</h2>
                </div>
              </div>

              <div className="management-list">
                {overview.alerts.outOfStockIngredients.map((item) => (
                  <div className="management-card" key={item.id}>
                    <div className="management-card__header">
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.sku || 'Sem SKU'} | {item.unit}</span>
                      </div>
                      <span className="status-chip status-chip--out">{alertLabel(item.alertStatus)}</span>
                    </div>

                    <div className="management-card__meta">
                      <span>Atual: {item.stockQuantity}</span>
                      <span>Minimo: {item.minimumStockLevel}</span>
                      <span className="text-danger">Falta: {item.shortageQuantity}</span>
                    </div>

                    <div className="management-card__meta">
                      <span>Fornecedor: {item.supplierName || 'Nao informado'}</span>
                      <span>Produtos afetados: {item.affectedProductsCount}</span>
                    </div>
                  </div>
                ))}

                {overview.alerts.lowStockIngredients.map((item) => (
                  <div className="management-card" key={item.id}>
                    <div className="management-card__header">
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.sku || 'Sem SKU'} | {item.unit}</span>
                      </div>
                      <span className="status-chip status-chip--low">{alertLabel(item.alertStatus)}</span>
                    </div>

                    <div className="management-card__meta">
                      <span>Atual: {item.stockQuantity}</span>
                      <span>Minimo: {item.minimumStockLevel}</span>
                      <span>Valor: {currency.format(item.inventoryValue)}</span>
                    </div>

                    <div className="management-card__meta">
                      <span>Fornecedor: {item.supplierName || 'Nao informado'}</span>
                      <span>Produtos afetados: {item.affectedProductsCount}</span>
                    </div>
                  </div>
                ))}

                {overview.alerts.outOfStockIngredients.length === 0 &&
                  overview.alerts.lowStockIngredients.length === 0 && (
                    <div className="empty-state">Nenhum alerta critico de estoque neste momento.</div>
                  )}
              </div>
            </article>

            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Impacto</p>
                  <h2>Risco no cardapio</h2>
                </div>
              </div>

              <div className="management-list">
                <div className="management-card">
                  <strong>Produtos impactados</strong>
                  {overview.alerts.productsAtRisk.length === 0 ? (
                    <p className="muted">Nenhum produto ativo depende de item critico agora.</p>
                  ) : (
                    <ul className="inline-list">
                      {overview.alerts.productsAtRisk.map((product) => (
                        <li key={product.id}>
                          {product.name}
                          {' | '}
                          {product.issueIngredients.join(', ')}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="management-card">
                  <strong>Ingredientes inativos ainda usados</strong>
                  {overview.alerts.inactiveRecipeIngredients.length === 0 ? (
                    <p className="muted">Nenhum ingrediente inativo esta preso em fichas tecnicas.</p>
                  ) : (
                    <ul className="inline-list">
                      {overview.alerts.inactiveRecipeIngredients.map((ingredient) => (
                        <li key={ingredient.id}>
                          {ingredient.name}
                          {' | '}
                          {ingredient.productNames.join(', ')}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="management-card">
                  <strong>Base de fornecedores</strong>
                  <div className="management-card__meta">
                    <span>{overview.kpis.suppliersCount} fornecedores mapeados</span>
                    <span>{overview.kpis.activeIngredients} insumos ativos</span>
                  </div>
                </div>
              </div>
            </article>
          </section>

          <section className="content-grid">
            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Relatorio</p>
                  <h2>Movimentacoes de estoque</h2>
                </div>
              </div>

              <form className="management-form" onSubmit={handleApplyFilters}>
                <div className="filter-grid">
                  <label>
                    Data inicial
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                    />
                  </label>

                  <label>
                    Data final
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
                    />
                  </label>

                  <label>
                    Tipo
                    <select
                      value={filters.movementType}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          movementType: event.target.value as ReportFilters['movementType'],
                        }))
                      }
                    >
                      <option value="">Todos</option>
                      <option value="in">Entrada</option>
                      <option value="out">Saida</option>
                      <option value="adjustment">Ajuste</option>
                    </select>
                  </label>

                  <label className="form-grid__full">
                    Item
                    <select
                      value={filters.itemId}
                      onChange={(event) => setFilters((current) => ({ ...current, itemId: event.target.value }))}
                    >
                      <option value="">Todos os insumos</option>
                      {ingredients.map((ingredient) => (
                        <option key={ingredient.id} value={ingredient.id}>
                          {ingredient.name} {ingredient.sku ? `| ${ingredient.sku}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="form-actions">
                  <button className="ghost-button" disabled={reportLoading} type="submit">
                    {reportLoading ? 'Atualizando...' : 'Aplicar filtros'}
                  </button>
                  <button className="secondary-button" onClick={() => void handleResetFilters()} type="button">
                    Ultimos 7 dias
                  </button>
                </div>
              </form>

              <div className="report-summary-strip">
                <span>Entradas: {report.summary.incomingQuantity}</span>
                <span>Saidas: {report.summary.outgoingQuantity}</span>
                <span>Valor de entrada: {currency.format(report.summary.incomingValue)}</span>
                <span>Valor de saida: {currency.format(report.summary.outgoingValue)}</span>
                <strong>{report.summary.movementCount} movimentos</strong>
              </div>

              {reportLoading ? (
                <div className="screen-state screen-state--compact">Atualizando relatorio de estoque...</div>
              ) : report.movements.length === 0 ? (
                <div className="empty-state">Nenhuma movimentacao encontrada para os filtros informados.</div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Item</th>
                        <th>Tipo</th>
                        <th>Quantidade</th>
                        <th>Valor</th>
                        <th>Origem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.movements.map((movement) => (
                        <tr key={movement.id}>
                          <td>{dateTime.format(new Date(movement.createdAt))}</td>
                          <td>
                            <strong>{movement.itemName}</strong>
                            <div className="muted">{movement.sku || 'Sem SKU'}</div>
                          </td>
                          <td>
                            <span className={`status-chip status-chip--movement-${movement.movementType}`}>
                              {movementLabel(movement.movementType)}
                            </span>
                          </td>
                          <td>
                            {movement.quantity} {movement.unit}
                          </td>
                          <td>{currency.format(movement.movementValue)}</td>
                          <td>{movement.orderReferenceCode || movement.reason || 'Manual'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Criticidade</p>
                  <h2>Itens e ultimos eventos</h2>
                </div>
              </div>

              <div className="management-list">
                <div className="management-card">
                  <strong>Itens criticos</strong>
                  {report.criticalItems.length === 0 ? (
                    <p className="muted">Nenhum item critico encontrado.</p>
                  ) : (
                    <ul className="inline-list">
                      {report.criticalItems.map((item) => (
                        <li key={item.id}>
                          {item.name}
                          {' | '}
                          {alertLabel(item.alertStatus)}
                          {' | atual '}
                          {item.stockQuantity}
                          {' | minimo '}
                          {item.minimumStockLevel}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="management-card">
                  <strong>Ultimas movimentacoes</strong>
                  {overview.recentMovements.length === 0 ? (
                    <p className="muted">Nenhuma movimentacao registrada ainda.</p>
                  ) : (
                    <ul className="inline-list">
                      {overview.recentMovements.map((movement) => (
                        <li key={movement.id}>
                          {movementLabel(movement.movementType)}
                          {' | '}
                          {movement.itemName}
                          {' | '}
                          {movement.quantity} {movement.unit}
                          {' | '}
                          {dateTime.format(new Date(movement.createdAt))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="management-card">
                  <strong>Leitura geral</strong>
                  <div className="management-card__meta">
                    <span>Valor atual: {currency.format(report.summary.inventoryValue)}</span>
                    <span>Itens baixos: {report.summary.lowStockIngredients}</span>
                    <span>Itens zerados: {report.summary.outOfStockIngredients}</span>
                  </div>
                </div>
              </div>
            </article>
          </section>
        </>
      )}
    </main>
  );
}
