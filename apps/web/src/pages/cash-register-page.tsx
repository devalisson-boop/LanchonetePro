import { useEffect, useState, type FormEvent } from 'react';

import { BackofficeHeader } from '../components/backoffice-header';
import { apiFetch } from '../lib/api';
import { useAuth } from '../providers/auth-provider';

type PaymentMethod = 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'voucher';
type PaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded' | 'cancelled';
type OrderStatus = 'draft' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
type CashSessionStatus = 'open' | 'closed';
type CashTransactionType = 'opening_float' | 'sale' | 'refund' | 'cash_in' | 'cash_out';

type CashSession = {
  id: string;
  referenceCode: string;
  status: CashSessionStatus;
  openingAmount: number;
  expectedAmount: number;
  countedAmount: number | null;
  differenceAmount: number | null;
  notes: string | null;
  openedBy: string | null;
  openedByName: string | null;
  closedBy: string | null;
  closedByName: string | null;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PendingOrder = {
  id: string;
  referenceCode: string;
  customerName: string | null;
  status: OrderStatus;
  totalAmount: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  outstandingAmount: number;
  createdAt: string;
};

type CashTransaction = {
  id: string;
  referenceCode: string;
  sessionId: string;
  sessionReferenceCode: string;
  orderId: string | null;
  orderReferenceCode: string | null;
  transactionType: CashTransactionType;
  status: 'confirmed' | 'cancelled';
  paymentMethod: PaymentMethod;
  amount: number;
  description: string | null;
  processedBy: string | null;
  processedByName: string | null;
  createdAt: string;
};

type SessionMetrics = {
  openingAmount: number;
  expectedDrawerAmount: number;
  countedAmount: number | null;
  differenceAmount: number | null;
  grossSales: number;
  refunds: number;
  netSales: number;
  cashEntries: number;
  cashExits: number;
  cashSales: number;
  cashRefunds: number;
  pixSales: number;
  creditCardSales: number;
  debitCardSales: number;
  voucherSales: number;
  transactionCount: number;
};

type RecentSession = CashSession & {
  transactionCount: number;
  grossSales: number;
};

type CashRegisterOverview = {
  currentSession: CashSession | null;
  sessionMetrics: SessionMetrics;
  pendingOrders: PendingOrder[];
  recentTransactions: CashTransaction[];
  recentSessions: RecentSession[];
};

type CashReport = {
  summary: {
    grossSales: number;
    refunds: number;
    netSales: number;
    cashEntries: number;
    cashExits: number;
    cashSales: number;
    cashRefunds: number;
    pixSales: number;
    creditCardSales: number;
    debitCardSales: number;
    voucherSales: number;
    transactionCount: number;
  };
  transactions: CashTransaction[];
};

type ReportFilters = {
  sessionId: string;
  transactionType: '' | CashTransactionType;
  paymentMethod: '' | PaymentMethod;
  dateFrom: string;
  dateTo: string;
};

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  credit_card: 'Cartao de credito',
  debit_card: 'Cartao de debito',
  voucher: 'Voucher',
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: 'Pendente',
  partial: 'Parcial',
  paid: 'Pago',
  refunded: 'Estornado',
  cancelled: 'Cancelado',
};

const orderStatusLabels: Record<OrderStatus, string> = {
  draft: 'Rascunho',
  confirmed: 'Confirmado',
  preparing: 'Em preparo',
  ready: 'Pronto',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

const transactionTypeLabels: Record<CashTransactionType, string> = {
  opening_float: 'Fundo inicial',
  sale: 'Pagamento',
  refund: 'Estorno',
  cash_in: 'Suprimento',
  cash_out: 'Sangria',
};

const sessionStatusLabels: Record<CashSessionStatus, string> = {
  open: 'Aberto',
  closed: 'Fechado',
};

const emptyReportFilters = (): ReportFilters => ({
  sessionId: '',
  transactionType: '',
  paymentMethod: '',
  dateFrom: '',
  dateTo: '',
});

function buildReportPath(filters: ReportFilters) {
  const params = new URLSearchParams();

  if (filters.sessionId) {
    params.set('sessionId', filters.sessionId);
  }

  if (filters.transactionType) {
    params.set('transactionType', filters.transactionType);
  }

  if (filters.paymentMethod) {
    params.set('paymentMethod', filters.paymentMethod);
  }

  if (filters.dateFrom) {
    params.set('dateFrom', filters.dateFrom);
  }

  if (filters.dateTo) {
    params.set('dateTo', filters.dateTo);
  }

  const query = params.toString();
  return query ? `cash-register/transactions?${query}` : 'cash-register/transactions';
}

export function CashRegisterPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(true);
  const [openSessionLoading, setOpenSessionLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [adjustmentLoading, setAdjustmentLoading] = useState(false);
  const [closeSessionLoading, setCloseSessionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [overview, setOverview] = useState<CashRegisterOverview | null>(null);
  const [report, setReport] = useState<CashReport | null>(null);
  const [openForm, setOpenForm] = useState({
    openingAmount: '150.00',
    notes: '',
  });
  const [paymentForm, setPaymentForm] = useState({
    orderId: '',
    amount: '',
    paymentMethod: 'cash' as PaymentMethod,
    description: '',
  });
  const [adjustmentForm, setAdjustmentForm] = useState({
    transactionType: 'cash_out' as 'cash_in' | 'cash_out',
    amount: '',
    description: '',
  });
  const [closeForm, setCloseForm] = useState({
    countedAmount: '',
    notes: '',
  });
  const [reportFilters, setReportFilters] = useState<ReportFilters>(emptyReportFilters);

  const currentSession = overview?.currentSession ?? null;
  const pendingOrders = overview?.pendingOrders ?? [];
  const recentTransactions = overview?.recentTransactions ?? [];
  const recentSessions = overview?.recentSessions ?? [];
  const sessionMetrics = overview?.sessionMetrics;

  async function loadOverview() {
    const data = await apiFetch<CashRegisterOverview>('cash-register');
    setOverview(data);

    setPaymentForm((current) => {
      if (!current.orderId) {
        return current;
      }

      const stillExists = data.pendingOrders.some((order) => order.id === current.orderId);
      return stillExists ? current : { ...current, orderId: '', amount: '', description: '' };
    });
  }

  async function loadReport(filters = reportFilters) {
    setReportLoading(true);

    try {
      const data = await apiFetch<CashReport>(buildReportPath(filters));
      setReport(data);
    } finally {
      setReportLoading(false);
    }
  }

  async function loadAll() {
    try {
      setLoading(true);
      setError(null);

      await Promise.all([loadOverview(), loadReport(reportFilters)]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar o caixa.');
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

  async function handleOpenSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOpenSessionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const nextOverview = await apiFetch<CashRegisterOverview>('cash-register/open', {
        method: 'POST',
        body: JSON.stringify({
          openingAmount: Number(openForm.openingAmount),
          notes: openForm.notes || undefined,
        }),
      });

      setOverview(nextOverview);
      setOpenForm({ openingAmount: '150.00', notes: '' });
      setCloseForm({ countedAmount: '', notes: '' });
      setSuccess('Caixa aberto com sucesso.');
      await loadReport(reportFilters);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Falha ao abrir o caixa.');
    } finally {
      setOpenSessionLoading(false);
    }
  }

  async function handleRegisterPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPaymentLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const nextOverview = await apiFetch<CashRegisterOverview>('cash-register/transactions', {
        method: 'POST',
        body: JSON.stringify({
          transactionType: 'sale',
          orderId: paymentForm.orderId,
          amount: Number(paymentForm.amount),
          paymentMethod: paymentForm.paymentMethod,
          description: paymentForm.description || undefined,
        }),
      });

      setOverview(nextOverview);
      setPaymentForm({
        orderId: '',
        amount: '',
        paymentMethod: 'cash',
        description: '',
      });
      setSuccess('Pagamento registrado no caixa.');
      await loadReport(reportFilters);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Falha ao registrar o pagamento.');
    } finally {
      setPaymentLoading(false);
    }
  }

  async function handleRegisterAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdjustmentLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const nextOverview = await apiFetch<CashRegisterOverview>('cash-register/transactions', {
        method: 'POST',
        body: JSON.stringify({
          transactionType: adjustmentForm.transactionType,
          amount: Number(adjustmentForm.amount),
          description: adjustmentForm.description || undefined,
        }),
      });

      setOverview(nextOverview);
      setAdjustmentForm({
        transactionType: 'cash_out',
        amount: '',
        description: '',
      });
      setSuccess('Movimentacao manual registrada.');
      await loadReport(reportFilters);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Falha ao registrar a movimentacao.');
    } finally {
      setAdjustmentLoading(false);
    }
  }

  async function handleCloseSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCloseSessionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const nextOverview = await apiFetch<CashRegisterOverview>('cash-register/close', {
        method: 'POST',
        body: JSON.stringify({
          countedAmount: Number(closeForm.countedAmount),
          notes: closeForm.notes || undefined,
        }),
      });

      setOverview(nextOverview);
      setCloseForm({ countedAmount: '', notes: '' });
      setSuccess('Caixa fechado com sucesso.');
      await loadReport(reportFilters);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Falha ao fechar o caixa.');
    } finally {
      setCloseSessionLoading(false);
    }
  }

  async function handleApplyReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      await loadReport(reportFilters);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'Falha ao consultar o relatorio.');
    }
  }

  async function handleClearReportFilters() {
    const nextFilters = emptyReportFilters();
    setReportFilters(nextFilters);
    setError(null);
    setSuccess(null);

    try {
      await loadReport(nextFilters);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'Falha ao recarregar o relatorio.');
    }
  }

  function handleSelectOrder(orderId: string) {
    const selectedOrder = pendingOrders.find((order) => order.id === orderId);

    setPaymentForm((current) => ({
      ...current,
      orderId,
      amount: selectedOrder ? selectedOrder.outstandingAmount.toFixed(2) : '',
    }));
  }

  return (
    <main className="dashboard-shell">
      <BackofficeHeader
        title="Caixa e Pagamentos"
        subtitle="Controle a abertura do caixa, receba pedidos, registre sangrias e feche o turno com relatorio."
        onRefresh={() => void loadAll()}
      />

      {error && <div className="banner banner--error">{error}</div>}
      {success && <div className="banner banner--success">{success}</div>}

      {loading || !overview || !report ? (
        <div className="screen-state">Carregando caixa, pagamentos e transacoes...</div>
      ) : (
        <>
          <section className="management-grid">
            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">{currentSession ? 'Turno Aberto' : 'Abertura de Caixa'}</p>
                  <h2>{currentSession ? `Sessao ${currentSession.referenceCode}` : 'Abrir caixa'}</h2>
                </div>
                {currentSession && (
                  <span className={`status-chip status-chip--${currentSession.status}`}>
                    {sessionStatusLabels[currentSession.status]}
                  </span>
                )}
              </div>

              {currentSession ? (
                <div className="management-list">
                  <div className="cash-kpi-grid">
                    <div className="stat-card stat-card--gold">
                      <span>Esperado no caixa</span>
                      <strong>{currency.format(sessionMetrics?.expectedDrawerAmount ?? 0)}</strong>
                    </div>
                    <div className="stat-card stat-card--green">
                      <span>Vendas liquidas</span>
                      <strong>{currency.format(sessionMetrics?.netSales ?? 0)}</strong>
                    </div>
                    <div className="stat-card stat-card--blue">
                      <span>Recebido em dinheiro</span>
                      <strong>{currency.format(sessionMetrics?.cashSales ?? 0)}</strong>
                    </div>
                    <div className="stat-card stat-card--red">
                      <span>Movimentacoes</span>
                      <strong>{sessionMetrics?.transactionCount ?? 0}</strong>
                    </div>
                  </div>

                  <div className="management-card">
                    <strong>Resumo operacional</strong>
                    <div className="management-card__meta">
                      <span>Abertura: {currency.format(currentSession.openingAmount)}</span>
                      <span>Aberto em {dateTime.format(new Date(currentSession.openedAt))}</span>
                      <span>{currentSession.openedByName || 'Operador nao identificado'}</span>
                    </div>
                    {currentSession.notes && <p className="muted">Obs: {currentSession.notes}</p>}
                    <div className="management-card__meta">
                      <span>Pix: {currency.format(sessionMetrics?.pixSales ?? 0)}</span>
                      <span>Credito: {currency.format(sessionMetrics?.creditCardSales ?? 0)}</span>
                      <span>Debito: {currency.format(sessionMetrics?.debitCardSales ?? 0)}</span>
                      <span>Voucher: {currency.format(sessionMetrics?.voucherSales ?? 0)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <form className="management-form" onSubmit={handleOpenSession}>
                  <div className="form-grid">
                    <label>
                      Fundo inicial
                      <input
                        min="0"
                        step="0.01"
                        type="number"
                        value={openForm.openingAmount}
                        onChange={(event) =>
                          setOpenForm((current) => ({ ...current, openingAmount: event.target.value }))
                        }
                      />
                    </label>

                    <label className="form-grid__full">
                      Observacoes
                      <textarea
                        rows={3}
                        value={openForm.notes}
                        onChange={(event) => setOpenForm((current) => ({ ...current, notes: event.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="form-actions">
                    <button className="primary-button" disabled={openSessionLoading} type="submit">
                      {openSessionLoading ? 'Abrindo caixa...' : 'Abrir caixa'}
                    </button>
                  </div>
                </form>
              )}
            </article>

            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">{currentSession ? 'Fechamento' : 'Historico'}</p>
                  <h2>{currentSession ? 'Fechar caixa' : 'Ultimas sessoes'}</h2>
                </div>
              </div>

              {currentSession ? (
                <form className="management-form" onSubmit={handleCloseSession}>
                  <div className="management-card">
                    <strong>Conferencia do turno</strong>
                    <div className="management-card__meta">
                      <span>Valor esperado: {currency.format(sessionMetrics?.expectedDrawerAmount ?? 0)}</span>
                      <span>Sangrias: {currency.format(sessionMetrics?.cashExits ?? 0)}</span>
                      <span>Suprimentos: {currency.format(sessionMetrics?.cashEntries ?? 0)}</span>
                    </div>
                  </div>

                  <div className="form-grid">
                    <label>
                      Valor contado no caixa
                      <input
                        min="0"
                        step="0.01"
                        type="number"
                        value={closeForm.countedAmount}
                        onChange={(event) =>
                          setCloseForm((current) => ({ ...current, countedAmount: event.target.value }))
                        }
                        required
                      />
                    </label>

                    <label className="form-grid__full">
                      Observacoes do fechamento
                      <textarea
                        rows={3}
                        value={closeForm.notes}
                        onChange={(event) => setCloseForm((current) => ({ ...current, notes: event.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="form-actions">
                    <button className="primary-button" disabled={closeSessionLoading} type="submit">
                      {closeSessionLoading ? 'Fechando caixa...' : 'Fechar caixa'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="management-list">
                  {recentSessions.map((cashSession) => (
                    <div className="management-card" key={cashSession.id}>
                      <div className="management-card__header">
                        <div>
                          <strong>{cashSession.referenceCode}</strong>
                          <span>{dateTime.format(new Date(cashSession.openedAt))}</span>
                        </div>
                        <span className={`status-chip status-chip--${cashSession.status}`}>
                          {sessionStatusLabels[cashSession.status]}
                        </span>
                      </div>

                      <div className="management-card__meta">
                        <span>Abertura: {currency.format(cashSession.openingAmount)}</span>
                        <span>Esperado: {currency.format(cashSession.expectedAmount)}</span>
                        <span>
                          Diferenca:{' '}
                          {cashSession.differenceAmount === null
                            ? 'Em aberto'
                            : currency.format(cashSession.differenceAmount)}
                        </span>
                      </div>

                      <div className="management-card__meta">
                        <span>Transacoes: {cashSession.transactionCount}</span>
                        <span>Vendas: {currency.format(cashSession.grossSales)}</span>
                      </div>
                    </div>
                  ))}

                  {recentSessions.length === 0 && <div className="empty-state">Nenhum fechamento registrado ainda.</div>}
                </div>
              )}
            </article>
          </section>

          {currentSession ? (
            <section className="management-grid">
              <article className="panel">
                <div className="panel__header">
                  <div>
                    <p className="eyebrow">Pagamentos</p>
                    <h2>Receber pedidos</h2>
                  </div>
                  <span className="muted">{pendingOrders.length} pedidos aguardando baixa</span>
                </div>

                <form className="management-form" onSubmit={handleRegisterPayment}>
                  <div className="form-grid">
                    <label className="form-grid__full">
                      Pedido
                      <select
                        value={paymentForm.orderId}
                        onChange={(event) => handleSelectOrder(event.target.value)}
                        required
                      >
                        <option value="">Selecione um pedido</option>
                        {pendingOrders.map((order) => (
                          <option key={order.id} value={order.id}>
                            {order.referenceCode} | {order.customerName || 'Balcao'} | saldo{' '}
                            {currency.format(order.outstandingAmount)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Valor recebido
                      <input
                        min="0.01"
                        step="0.01"
                        type="number"
                        value={paymentForm.amount}
                        onChange={(event) =>
                          setPaymentForm((current) => ({ ...current, amount: event.target.value }))
                        }
                        required
                      />
                    </label>

                    <label>
                      Forma de pagamento
                      <select
                        value={paymentForm.paymentMethod}
                        onChange={(event) =>
                          setPaymentForm((current) => ({
                            ...current,
                            paymentMethod: event.target.value as PaymentMethod,
                          }))
                        }
                      >
                        <option value="cash">Dinheiro</option>
                        <option value="pix">Pix</option>
                        <option value="credit_card">Cartao de credito</option>
                        <option value="debit_card">Cartao de debito</option>
                        <option value="voucher">Voucher</option>
                      </select>
                    </label>

                    <label className="form-grid__full">
                      Observacao
                      <textarea
                        rows={2}
                        value={paymentForm.description}
                        onChange={(event) =>
                          setPaymentForm((current) => ({ ...current, description: event.target.value }))
                        }
                      />
                    </label>
                  </div>

                  <div className="form-actions">
                    <button
                      className="primary-button"
                      disabled={paymentLoading || pendingOrders.length === 0}
                      type="submit"
                    >
                      {paymentLoading ? 'Registrando...' : 'Registrar pagamento'}
                    </button>
                  </div>
                </form>

                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Pedido</th>
                        <th>Status</th>
                        <th>Total</th>
                        <th>Pago</th>
                        <th>Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingOrders.map((order) => (
                        <tr key={order.id}>
                          <td>
                            <strong>{order.referenceCode}</strong>
                            <div className="muted">{order.customerName || 'Balcao'}</div>
                          </td>
                          <td>
                            <span className={`status-chip status-chip--${order.paymentStatus}`}>
                              {paymentStatusLabels[order.paymentStatus]}
                            </span>
                            <div className="muted">{orderStatusLabels[order.status]}</div>
                          </td>
                          <td>{currency.format(order.totalAmount)}</td>
                          <td>{currency.format(order.paidAmount)}</td>
                          <td>{currency.format(order.outstandingAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {pendingOrders.length === 0 && <div className="empty-state">Nenhum pedido aguardando pagamento.</div>}
              </article>

              <article className="panel">
                <div className="panel__header">
                  <div>
                    <p className="eyebrow">Movimentacoes</p>
                    <h2>Suprimento e sangria</h2>
                  </div>
                </div>

                <form className="management-form" onSubmit={handleRegisterAdjustment}>
                  <div className="form-grid">
                    <label>
                      Tipo
                      <select
                        value={adjustmentForm.transactionType}
                        onChange={(event) =>
                          setAdjustmentForm((current) => ({
                            ...current,
                            transactionType: event.target.value as 'cash_in' | 'cash_out',
                          }))
                        }
                      >
                        <option value="cash_out">Sangria</option>
                        <option value="cash_in">Suprimento</option>
                      </select>
                    </label>

                    <label>
                      Valor
                      <input
                        min="0.01"
                        step="0.01"
                        type="number"
                        value={adjustmentForm.amount}
                        onChange={(event) =>
                          setAdjustmentForm((current) => ({ ...current, amount: event.target.value }))
                        }
                        required
                      />
                    </label>

                    <label className="form-grid__full">
                      Motivo
                      <textarea
                        rows={3}
                        value={adjustmentForm.description}
                        onChange={(event) =>
                          setAdjustmentForm((current) => ({ ...current, description: event.target.value }))
                        }
                      />
                    </label>
                  </div>

                  <div className="form-actions">
                    <button className="secondary-button" disabled={adjustmentLoading} type="submit">
                      {adjustmentLoading ? 'Gravando...' : 'Registrar movimentacao'}
                    </button>
                  </div>
                </form>

                <div className="management-list">
                  <div className="management-card">
                    <strong>Leituras rapidas do caixa</strong>
                    <div className="management-card__meta">
                      <span>Suprimentos: {currency.format(sessionMetrics?.cashEntries ?? 0)}</span>
                      <span>Sangrias: {currency.format(sessionMetrics?.cashExits ?? 0)}</span>
                      <span>Estornos em dinheiro: {currency.format(sessionMetrics?.cashRefunds ?? 0)}</span>
                    </div>
                  </div>

                  <div className="management-card">
                    <strong>Boas praticas</strong>
                    <p className="muted">
                      Use suprimento quando colocar dinheiro no caixa e sangria quando retirar valores para cofre ou
                      despesas operacionais.
                    </p>
                  </div>
                </div>
              </article>
            </section>
          ) : (
            <section className="content-grid">
              <article className="panel panel--accent">
                <div className="panel__header">
                  <div>
                    <p className="eyebrow">Operacao</p>
                    <h2>Caixa fechado no momento</h2>
                  </div>
                </div>

                <div className="screen-state screen-state--compact">
                  Abra uma nova sessao para receber pagamentos, lancar sangrias e fechar o turno.
                </div>
              </article>
            </section>
          )}

          <section className="content-grid">
            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Ultimos lancamentos</p>
                  <h2>Transacoes da sessao atual</h2>
                </div>
              </div>

              {recentTransactions.length === 0 ? (
                <div className="empty-state">Nenhuma transacao registrada nesta sessao.</div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Horario</th>
                        <th>Tipo</th>
                        <th>Pedido</th>
                        <th>Metodo</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTransactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td>{dateTime.format(new Date(transaction.createdAt))}</td>
                          <td>{transactionTypeLabels[transaction.transactionType]}</td>
                          <td>{transaction.orderReferenceCode || '-'}</td>
                          <td>{paymentMethodLabels[transaction.paymentMethod]}</td>
                          <td>{currency.format(transaction.amount)}</td>
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
                  <p className="eyebrow">Relatorio</p>
                  <h2>Transacoes filtradas</h2>
                </div>
              </div>

              <form className="management-form" onSubmit={handleApplyReport}>
                <div className="filter-grid">
                  <label>
                    Sessao
                    <select
                      value={reportFilters.sessionId}
                      onChange={(event) =>
                        setReportFilters((current) => ({ ...current, sessionId: event.target.value }))
                      }
                    >
                      <option value="">Todas</option>
                      {recentSessions.map((cashSession) => (
                        <option key={cashSession.id} value={cashSession.id}>
                          {cashSession.referenceCode}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Tipo
                    <select
                      value={reportFilters.transactionType}
                      onChange={(event) =>
                        setReportFilters((current) => ({
                          ...current,
                          transactionType: event.target.value as ReportFilters['transactionType'],
                        }))
                      }
                    >
                      <option value="">Todos</option>
                      <option value="opening_float">Fundo inicial</option>
                      <option value="sale">Pagamento</option>
                      <option value="refund">Estorno</option>
                      <option value="cash_in">Suprimento</option>
                      <option value="cash_out">Sangria</option>
                    </select>
                  </label>

                  <label>
                    Metodo
                    <select
                      value={reportFilters.paymentMethod}
                      onChange={(event) =>
                        setReportFilters((current) => ({
                          ...current,
                          paymentMethod: event.target.value as ReportFilters['paymentMethod'],
                        }))
                      }
                    >
                      <option value="">Todos</option>
                      <option value="cash">Dinheiro</option>
                      <option value="pix">Pix</option>
                      <option value="credit_card">Cartao de credito</option>
                      <option value="debit_card">Cartao de debito</option>
                      <option value="voucher">Voucher</option>
                    </select>
                  </label>

                  <label>
                    Data inicial
                    <input
                      type="date"
                      value={reportFilters.dateFrom}
                      onChange={(event) =>
                        setReportFilters((current) => ({ ...current, dateFrom: event.target.value }))
                      }
                    />
                  </label>

                  <label>
                    Data final
                    <input
                      type="date"
                      value={reportFilters.dateTo}
                      onChange={(event) =>
                        setReportFilters((current) => ({ ...current, dateTo: event.target.value }))
                      }
                    />
                  </label>
                </div>

                <div className="form-actions">
                  <button className="ghost-button" disabled={reportLoading} type="submit">
                    {reportLoading ? 'Consultando...' : 'Aplicar filtros'}
                  </button>
                  <button className="secondary-button" onClick={() => void handleClearReportFilters()} type="button">
                    Limpar
                  </button>
                </div>
              </form>

              <div className="report-summary-strip">
                <span>Vendas: {currency.format(report.summary.grossSales)}</span>
                <span>Liquido: {currency.format(report.summary.netSales)}</span>
                <span>Dinheiro: {currency.format(report.summary.cashSales)}</span>
                <span>Pix: {currency.format(report.summary.pixSales)}</span>
                <strong>{report.summary.transactionCount} transacoes</strong>
              </div>

              {reportLoading ? (
                <div className="screen-state screen-state--compact">Atualizando relatorio...</div>
              ) : report.transactions.length === 0 ? (
                <div className="empty-state">Nenhuma transacao encontrada para os filtros informados.</div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Referencia</th>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th>Pedido</th>
                        <th>Metodo</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.transactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td>
                            <strong>{transaction.referenceCode}</strong>
                            <div className="muted">{transaction.sessionReferenceCode}</div>
                          </td>
                          <td>{dateTime.format(new Date(transaction.createdAt))}</td>
                          <td>{transactionTypeLabels[transaction.transactionType]}</td>
                          <td>{transaction.orderReferenceCode || '-'}</td>
                          <td>{paymentMethodLabels[transaction.paymentMethod]}</td>
                          <td>{currency.format(transaction.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        </>
      )}
    </main>
  );
}
