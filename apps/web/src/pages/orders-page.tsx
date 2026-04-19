import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { BackofficeHeader } from '../components/backoffice-header';
import { apiFetch } from '../lib/api';
import { useAuth } from '../providers/auth-provider';

type OrderStatus = 'draft' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
type OrderType = 'counter' | 'delivery' | 'pickup' | 'table';

type Product = {
  id: string;
  name: string;
  categoryName: string | null;
  price: number;
  isAvailable: boolean;
};

type Table = {
  id: string;
  name: string;
  seats: number;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning';
};

type OrderItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

type OrderHistoryEntry = {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  notes: string | null;
  changedByName: string | null;
  createdAt: string;
};

type Order = {
  id: string;
  referenceCode: string;
  orderType: OrderType;
  status: OrderStatus;
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  tableId: string | null;
  tableName: string | null;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: string | null;
  itemCount: number;
  stockDeductedAt: string | null;
  printedAt: string | null;
  printCount: number;
  createdAt: string;
  updatedAt: string;
  availableTransitions: OrderStatus[];
  items: OrderItem[];
  statusHistory?: OrderHistoryEntry[];
};

type OrderFormState = {
  orderType: OrderType;
  tableId: string;
  customerName: string;
  customerPhone: string;
  notes: string;
  paymentMethod: '' | 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'voucher';
  discountAmount: string;
  items: Array<{
    productId: string;
    quantity: string;
  }>;
};

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const orderTypeLabels: Record<OrderType, string> = {
  counter: 'Balcao',
  delivery: 'Delivery',
  pickup: 'Retirada',
  table: 'Mesa',
};

const statusLabels: Record<OrderStatus, string> = {
  draft: 'Rascunho',
  confirmed: 'Confirmado',
  preparing: 'Em preparo',
  ready: 'Pronto',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

const paymentLabels: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  credit_card: 'Cartao de credito',
  debit_card: 'Cartao de debito',
  voucher: 'Voucher',
};

const workflowColumns: Array<{ status: OrderStatus; title: string }> = [
  { status: 'confirmed', title: 'Confirmados' },
  { status: 'preparing', title: 'Em preparo' },
  { status: 'ready', title: 'Prontos' },
];

const emptyOrderForm = (): OrderFormState => ({
  orderType: 'counter',
  tableId: '',
  customerName: '',
  customerPhone: '',
  notes: '',
  paymentMethod: '',
  discountAmount: '',
  items: [
    {
      productId: '',
      quantity: '1',
    },
  ],
});

function parseOptionalNumber(value: string) {
  if (value.trim() === '') {
    return undefined;
  }

  return Number(value);
}

function transitionLabel(status: OrderStatus) {
  switch (status) {
    case 'preparing':
      return 'Iniciar preparo';
    case 'ready':
      return 'Marcar pronto';
    case 'delivered':
      return 'Finalizar';
    case 'cancelled':
      return 'Cancelar';
    case 'confirmed':
      return 'Confirmar';
    default:
      return statusLabels[status];
  }
}

function buildTicketHtml(order: Order) {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Comanda ${order.referenceCode}</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 24px;
        color: #1e140f;
      }
      .ticket {
        max-width: 340px;
        margin: 0 auto;
        border: 1px dashed #6f5b50;
        padding: 20px;
      }
      h1, h2, p {
        margin: 0;
      }
      .header,
      .meta,
      .items,
      .footer {
        display: grid;
        gap: 10px;
      }
      .header {
        text-align: center;
        margin-bottom: 16px;
      }
      .meta {
        margin-bottom: 14px;
        font-size: 13px;
      }
      .item {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 14px;
      }
      .item strong {
        display: block;
      }
      .divider {
        border-top: 1px dashed #6f5b50;
        margin: 12px 0;
      }
      .footer {
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <section class="ticket">
      <div class="header">
        <h1>Lanchonete Pro</h1>
        <p>Comanda ${order.referenceCode}</p>
      </div>
      <div class="meta">
        <p><strong>Tipo:</strong> ${orderTypeLabels[order.orderType]}</p>
        <p><strong>Status:</strong> ${statusLabels[order.status]}</p>
        <p><strong>Cliente:</strong> ${order.customerName || 'Balcao'}</p>
        ${order.tableName ? `<p><strong>Mesa:</strong> ${order.tableName}</p>` : ''}
        <p><strong>Data:</strong> ${dateTime.format(new Date(order.createdAt))}</p>
      </div>
      <div class="divider"></div>
      <div class="items">
        ${order.items
          .map(
            (item) => `
              <div class="item">
                <div>
                  <strong>${item.productName}</strong>
                  <span>${item.quantity} x ${currency.format(item.unitPrice)}</span>
                </div>
                <span>${currency.format(item.totalPrice)}</span>
              </div>
            `,
          )
          .join('')}
      </div>
      <div class="divider"></div>
      <div class="footer">
        <p><strong>Subtotal:</strong> ${currency.format(order.subtotal)}</p>
        <p><strong>Desconto:</strong> ${currency.format(order.discountAmount)}</p>
        <p><strong>Total:</strong> ${currency.format(order.totalAmount)}</p>
        ${
          order.notes
            ? `<div class="divider"></div><p><strong>Observacoes:</strong> ${order.notes}</p>`
            : ''
        }
      </div>
    </section>
  </body>
</html>`;
}

export function OrdersPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [orderForm, setOrderForm] = useState<OrderFormState>(emptyOrderForm);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      const [productData, orderData, tableData] = await Promise.all([
        apiFetch<Product[]>('products'),
        apiFetch<Order[]>('orders'),
        apiFetch<Table[]>('tables'),
      ]);

      setProducts(productData.filter((product) => product.isAvailable));
      setOrders(orderData);
      setTables(tableData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar a central de pedidos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session) {
      return;
    }

    void loadData();
  }, [session]);

  const activeOrders = useMemo(
    () => orders.filter((order) => ['confirmed', 'preparing', 'ready'].includes(order.status)),
    [orders],
  );

  const closedOrders = useMemo(
    () => orders.filter((order) => ['delivered', 'cancelled'].includes(order.status)).slice(0, 8),
    [orders],
  );

  const pendingPrintCount = useMemo(
    () => activeOrders.filter((order) => order.printCount === 0).length,
    [activeOrders],
  );

  const orderPreview = useMemo(() => {
    const items = orderForm.items
      .filter((item) => item.productId && item.quantity.trim() !== '')
      .map((item) => {
        const product = products.find((entry) => entry.id === item.productId);
        const quantity = Number(item.quantity);

        return {
          product,
          quantity,
          total: product ? product.price * quantity : 0,
        };
      });

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const discount = parseOptionalNumber(orderForm.discountAmount) ?? 0;

    return {
      subtotal,
      discount,
      total: Math.max(subtotal - discount, 0),
    };
  }, [orderForm.discountAmount, orderForm.items, products]);

  function addItemRow() {
    setOrderForm((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          productId: '',
          quantity: '1',
        },
      ],
    }));
  }

  function updateItemRow(index: number, field: 'productId' | 'quantity', value: string) {
    setOrderForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    }));
  }

  function removeItemRow(index: number) {
    setOrderForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function handleCreateOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingOrder(true);
    setError(null);
    setSuccess(null);

    try {
      const items = orderForm.items
        .filter((item) => item.productId && item.quantity.trim() !== '')
        .map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
        }));

      if (items.length === 0) {
        throw new Error('Adicione pelo menos um item ao pedido.');
      }

      await apiFetch<Order>('orders', {
        method: 'POST',
        body: JSON.stringify({
          orderType: orderForm.orderType,
          tableId: orderForm.orderType === 'table' ? orderForm.tableId || undefined : undefined,
          customerName: orderForm.customerName || undefined,
          customerPhone: orderForm.customerPhone || undefined,
          notes: orderForm.notes || undefined,
          paymentMethod: orderForm.paymentMethod || undefined,
          discountAmount: parseOptionalNumber(orderForm.discountAmount),
          items,
        }),
      });

      setSuccess('Pedido criado com sucesso.');
      setOrderForm(emptyOrderForm());
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Falha ao criar o pedido.');
    } finally {
      setCreatingOrder(false);
    }
  }

  async function handleTransition(orderId: string, nextStatus: OrderStatus) {
    setUpdatingOrderId(orderId);
    setError(null);
    setSuccess(null);

    try {
      await apiFetch<Order>(`orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
        }),
      });

      setSuccess(`Pedido movido para ${statusLabels[nextStatus].toLowerCase()}.`);
      await loadData();
    } catch (transitionError) {
      setError(transitionError instanceof Error ? transitionError.message : 'Falha ao atualizar o status do pedido.');
    } finally {
      setUpdatingOrderId(null);
    }
  }

  async function handlePrint(orderId: string) {
    setPrintingOrderId(orderId);
    setError(null);
    setSuccess(null);

    try {
      const printableOrder = await apiFetch<Order>(`orders/${orderId}/print-ticket`, {
        method: 'POST',
      });

      const printWindow = window.open('', '_blank', 'width=900,height=700');

      if (!printWindow) {
        throw new Error('O navegador bloqueou a janela de impressao. Libere popups para continuar.');
      }

      printWindow.document.write(buildTicketHtml(printableOrder));
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();

      setSuccess('Comanda enviada para impressao.');
      await loadData();
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : 'Falha ao imprimir a comanda.');
    } finally {
      setPrintingOrderId(null);
    }
  }

  function renderOrderCard(order: Order) {
    return (
      <div className="management-card order-card--board" key={order.id}>
        <div className="management-card__header">
          <div>
            <strong>{order.referenceCode}</strong>
            <span>
              {orderTypeLabels[order.orderType]} | {order.customerName || 'Balcao'}
              {order.tableName ? ` | ${order.tableName}` : ''}
            </span>
          </div>
          <span className={`status-chip status-chip--${order.status}`}>{statusLabels[order.status]}</span>
        </div>

        <div className="management-card__meta">
          <span>Total: {currency.format(order.totalAmount)}</span>
          <span>Itens: {order.itemCount}</span>
          <span>{order.paymentMethod ? paymentLabels[order.paymentMethod] : 'Pagamento pendente'}</span>
        </div>

        <ul className="inline-list">
          {order.items.map((item) => (
            <li key={item.id}>
              {item.productName}: {item.quantity} x {currency.format(item.unitPrice)}
            </li>
          ))}
        </ul>

        {order.notes && <p className="muted">Obs: {order.notes}</p>}

        <div className="management-card__meta">
          <span>Criado em {dateTime.format(new Date(order.createdAt))}</span>
          <span>{order.stockDeductedAt ? 'Estoque baixado' : 'Estoque pendente'}</span>
          <span>{order.printCount > 0 ? `Impresso ${order.printCount}x` : 'Ainda nao impresso'}</span>
        </div>

        <div className="inline-actions">
          <button
            className="ghost-button"
            disabled={printingOrderId === order.id}
            onClick={() => void handlePrint(order.id)}
            type="button"
          >
            {printingOrderId === order.id ? 'Imprimindo...' : 'Imprimir comanda'}
          </button>
          {order.availableTransitions.map((nextStatus) => (
            <button
              className={nextStatus === 'cancelled' ? 'danger-button' : 'secondary-button'}
              disabled={updatingOrderId === order.id}
              key={nextStatus}
              onClick={() => void handleTransition(order.id, nextStatus)}
              type="button"
            >
              {transitionLabel(nextStatus)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <main className="dashboard-shell">
      <BackofficeHeader
        title="Central de Pedidos"
        subtitle="Crie comandas, acompanhe o fluxo da cozinha e imprima os tickets do atendimento."
        onRefresh={() => void loadData()}
      />

      {error && <div className="banner banner--error">{error}</div>}
      {success && <div className="banner banner--success">{success}</div>}

      {loading ? (
        <div className="screen-state">Carregando pedidos e cardapio...</div>
      ) : (
        <>
          <section className="management-grid">
            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Nova Comanda</p>
                  <h2>Criar pedido</h2>
                </div>
              </div>

              <form className="management-form" onSubmit={handleCreateOrder}>
                <div className="form-grid">
                  <label>
                    Tipo do pedido
                    <select
                      value={orderForm.orderType}
                      onChange={(event) =>
                        setOrderForm((current) => ({
                          ...current,
                          orderType: event.target.value as OrderType,
                          tableId: event.target.value === 'table' ? current.tableId : '',
                        }))
                      }
                    >
                      <option value="counter">Balcao</option>
                      <option value="delivery">Delivery</option>
                      <option value="pickup">Retirada</option>
                      <option value="table">Mesa</option>
                    </select>
                  </label>

                  {orderForm.orderType === 'table' ? (
                    <label>
                      Mesa
                      <select
                        value={orderForm.tableId}
                        onChange={(event) => setOrderForm((current) => ({ ...current, tableId: event.target.value }))}
                        required
                      >
                        <option value="">Selecione uma mesa</option>
                        {tables.map((table) => (
                          <option key={table.id} value={table.id}>
                            {table.name} ({table.status})
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label>
                      Cliente
                      <input
                        value={orderForm.customerName}
                        onChange={(event) =>
                          setOrderForm((current) => ({ ...current, customerName: event.target.value }))
                        }
                      />
                    </label>
                  )}

                  <label>
                    Telefone
                    <input
                      value={orderForm.customerPhone}
                      onChange={(event) =>
                        setOrderForm((current) => ({ ...current, customerPhone: event.target.value }))
                      }
                    />
                  </label>

                  <label>
                    Pagamento
                    <select
                      value={orderForm.paymentMethod}
                      onChange={(event) =>
                        setOrderForm((current) => ({
                          ...current,
                          paymentMethod: event.target.value as OrderFormState['paymentMethod'],
                        }))
                      }
                    >
                      <option value="">Selecionar depois</option>
                      <option value="cash">Dinheiro</option>
                      <option value="pix">Pix</option>
                      <option value="credit_card">Cartao de credito</option>
                      <option value="debit_card">Cartao de debito</option>
                      <option value="voucher">Voucher</option>
                    </select>
                  </label>

                  <label>
                    Desconto
                    <input
                      min="0"
                      step="0.01"
                      type="number"
                      value={orderForm.discountAmount}
                      onChange={(event) =>
                        setOrderForm((current) => ({ ...current, discountAmount: event.target.value }))
                      }
                    />
                  </label>

                  <label className="form-grid__full">
                    Observacoes
                    <textarea
                      rows={3}
                      value={orderForm.notes}
                      onChange={(event) => setOrderForm((current) => ({ ...current, notes: event.target.value }))}
                    />
                  </label>
                </div>

                <div className="recipe-section">
                  <div className="panel__header">
                    <div>
                      <p className="eyebrow">Itens</p>
                      <h2>Monte a comanda</h2>
                    </div>
                    <button className="ghost-button" onClick={addItemRow} type="button">
                      Adicionar item
                    </button>
                  </div>

                  <div className="recipe-list">
                    {orderForm.items.map((item, index) => (
                      <div className="recipe-row order-item-row" key={`${item.productId}-${index}`}>
                        <select
                          value={item.productId}
                          onChange={(event) => updateItemRow(index, 'productId', event.target.value)}
                        >
                          <option value="">Selecione um produto</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name} | {currency.format(product.price)}
                            </option>
                          ))}
                        </select>

                        <input
                          min="0.01"
                          step="0.01"
                          type="number"
                          value={item.quantity}
                          onChange={(event) => updateItemRow(index, 'quantity', event.target.value)}
                          placeholder="Qtd."
                        />

                        <button className="danger-button" onClick={() => removeItemRow(index)} type="button">
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="order-summary-strip">
                    <span>Subtotal: {currency.format(orderPreview.subtotal)}</span>
                    <span>Desconto: {currency.format(orderPreview.discount)}</span>
                    <strong>Total: {currency.format(orderPreview.total)}</strong>
                  </div>
                </div>

                <div className="form-actions">
                  <button className="primary-button" disabled={creatingOrder} type="submit">
                    {creatingOrder ? 'Criando pedido...' : 'Criar pedido'}
                  </button>
                </div>
              </form>
            </article>

            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Operacao</p>
                  <h2>Visao rapida</h2>
                </div>
              </div>

              <div className="orders-kpi-grid">
                <div className="stat-card stat-card--gold">
                  <span>Pedidos abertos</span>
                  <strong>{activeOrders.length}</strong>
                </div>
                <div className="stat-card stat-card--blue">
                  <span>Esperando impressao</span>
                  <strong>{pendingPrintCount}</strong>
                </div>
                <div className="stat-card stat-card--green">
                  <span>Mesas cadastradas</span>
                  <strong>{tables.length}</strong>
                </div>
              </div>

              <div className="management-list">
                <div className="management-card">
                  <strong>Workflow ativo</strong>
                  <p className="muted">Confirmado {'->'} Em preparo {'->'} Pronto {'->'} Entregue</p>
                  <p className="muted">Cancelamentos revertem o estoque automaticamente.</p>
                </div>

                <div className="management-card">
                  <strong>Impressao de comanda</strong>
                  <p className="muted">Cada ticket abre uma janela pronta para imprimir e registra a contagem de impressao.</p>
                </div>

                <div className="management-card">
                  <strong>Integracao com estoque</strong>
                  <p className="muted">Pedidos baixam ingredientes da ficha tecnica. Se o produto nao tiver ficha, usa o estoque direto do produto.</p>
                </div>
              </div>
            </article>
          </section>

          <section className="workflow-grid">
            {workflowColumns.map((column) => (
              <article className="panel workflow-column" key={column.status}>
                <div className="panel__header">
                  <div>
                    <p className="eyebrow">Workflow</p>
                    <h2>{column.title}</h2>
                  </div>
                  <span className="muted">
                    {activeOrders.filter((order) => order.status === column.status).length} pedidos
                  </span>
                </div>

                <div className="management-list">
                  {activeOrders.filter((order) => order.status === column.status).map(renderOrderCard)}
                  {activeOrders.filter((order) => order.status === column.status).length === 0 && (
                    <div className="empty-state">Nenhum pedido nesta etapa.</div>
                  )}
                </div>
              </article>
            ))}
          </section>

          <section className="content-grid">
            <article className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Historico</p>
                  <h2>Pedidos finalizados ou cancelados</h2>
                </div>
              </div>

              <div className="management-list">
                {closedOrders.map((order) => (
                  <div className="management-card" key={order.id}>
                    <div className="management-card__header">
                      <div>
                        <strong>{order.referenceCode}</strong>
                        <span>
                          {order.customerName || 'Balcao'} | {dateTime.format(new Date(order.updatedAt))}
                        </span>
                      </div>
                      <span className={`status-chip status-chip--${order.status}`}>{statusLabels[order.status]}</span>
                    </div>

                    <div className="management-card__meta">
                      <span>Total: {currency.format(order.totalAmount)}</span>
                      <span>Itens: {order.itemCount}</span>
                      <span>{order.printCount > 0 ? `Impresso ${order.printCount}x` : 'Nao impresso'}</span>
                    </div>

                    <div className="inline-actions">
                      <button
                        className="ghost-button"
                        disabled={printingOrderId === order.id}
                        onClick={() => void handlePrint(order.id)}
                        type="button"
                      >
                        Reimprimir
                      </button>
                    </div>
                  </div>
                ))}

                {closedOrders.length === 0 && <div className="empty-state">Nenhum pedido encerrado ainda.</div>}
              </div>
            </article>
          </section>
        </>
      )}
    </main>
  );
}
