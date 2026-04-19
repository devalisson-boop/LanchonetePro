import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

import type { AuthenticatedUser } from '../../shared/types/authenticated-user.type.js';
import { PG_POOL } from '../database/database.constants.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { CloseCashSessionDto } from './dto/close-cash-session.dto.js';
import { CreateCashTransactionDto } from './dto/create-cash-transaction.dto.js';
import { OpenCashSessionDto } from './dto/open-cash-session.dto.js';

type PaymentMethod = 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'voucher';
type PaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded' | 'cancelled';
type OrderStatus = 'draft' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
type CashSessionStatus = 'open' | 'closed';
type CashTransactionType = 'opening_float' | 'sale' | 'refund' | 'cash_in' | 'cash_out';

type CashSessionRecord = {
  id: string;
  reference_code: string;
  status: CashSessionStatus;
  opening_amount: string;
  expected_amount: string;
  counted_amount: string | null;
  difference_amount: string | null;
  notes: string | null;
  opened_by: string | null;
  opened_by_name: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

type CashTransactionRecord = {
  id: string;
  reference_code: string;
  session_id: string;
  session_reference_code: string;
  order_id: string | null;
  order_reference_code: string | null;
  transaction_type: CashTransactionType;
  status: 'confirmed' | 'cancelled';
  payment_method: PaymentMethod;
  amount: string;
  description: string | null;
  processed_by: string | null;
  processed_by_name: string | null;
  created_at: string;
};

type PendingOrderRecord = {
  id: string;
  reference_code: string;
  customer_name: string | null;
  status: OrderStatus;
  total_amount: string;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  paid_amount: string;
  outstanding_amount: string;
  created_at: string;
};

type SessionMetricRow = {
  gross_sales: string;
  refunds: string;
  cash_entries: string;
  cash_exits: string;
  cash_sales: string;
  cash_refunds: string;
  pix_sales: string;
  credit_card_sales: string;
  debit_card_sales: string;
  voucher_sales: string;
  transaction_count: number;
};

type RecentSessionRow = CashSessionRecord & {
  transaction_count: number;
  gross_sales: string;
};

type OrderPaymentRecord = {
  id: string;
  reference_code: string;
  status: OrderStatus;
  total_amount: string;
  paid_amount: string;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
};

type OrderPaymentAggregateRow = {
  sales_total: string;
  refund_total: string;
};

type DrawerBalanceRow = {
  expected_amount: string;
};

type TransactionFilters = {
  sessionId?: string;
  transactionType?: CashTransactionType;
  paymentMethod?: PaymentMethod;
  dateFrom?: string;
  dateTo?: string;
};

@Injectable()
export class CashRegisterService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(ProfilesService) private readonly profilesService: ProfilesService,
  ) {}

  async getOverview() {
    const [currentSession, pendingOrders, recentSessions] = await Promise.all([
      this.findCurrentSession(),
      this.listPendingOrders(),
      this.listRecentSessions(),
    ]);

    if (!currentSession) {
      return {
        currentSession: null,
        sessionMetrics: this.emptyMetrics(),
        pendingOrders,
        recentTransactions: [],
        recentSessions,
      };
    }

    const [recentTransactions, sessionMetrics] = await Promise.all([
      this.listTransactionsBySession(currentSession.id, 20),
      this.getSessionMetrics(currentSession),
    ]);

    return {
      currentSession: this.toSessionResponse(currentSession),
      sessionMetrics,
      pendingOrders,
      recentTransactions,
      recentSessions,
    };
  }

  async listTransactions(filters: TransactionFilters) {
    this.assertValidFilters(filters);

    const listQuery = this.buildTransactionQuery(filters, false);
    const summaryQuery = this.buildTransactionQuery(filters, true);

    const [transactionsResult, summaryResult] = await Promise.all([
      this.pool.query<CashTransactionRecord>(listQuery.text, listQuery.values),
      this.pool.query<SessionMetricRow>(summaryQuery.text, summaryQuery.values),
    ]);

    const summary = summaryResult.rows[0];

    return {
      summary: {
        grossSales: Number(summary?.gross_sales ?? 0),
        refunds: Number(summary?.refunds ?? 0),
        netSales: Number(summary?.gross_sales ?? 0) - Number(summary?.refunds ?? 0),
        cashEntries: Number(summary?.cash_entries ?? 0),
        cashExits: Number(summary?.cash_exits ?? 0),
        cashSales: Number(summary?.cash_sales ?? 0),
        cashRefunds: Number(summary?.cash_refunds ?? 0),
        pixSales: Number(summary?.pix_sales ?? 0),
        creditCardSales: Number(summary?.credit_card_sales ?? 0),
        debitCardSales: Number(summary?.debit_card_sales ?? 0),
        voucherSales: Number(summary?.voucher_sales ?? 0),
        transactionCount: summary?.transaction_count ?? 0,
      },
      transactions: transactionsResult.rows.map((transaction) => this.toTransactionResponse(transaction)),
    };
  }

  async openSession(user: AuthenticatedUser, dto: OpenCashSessionDto) {
    await this.profilesService.ensureProfile(user);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      const existingSession = await this.findCurrentSession(client, true);

      if (existingSession) {
        throw new ConflictException('Ja existe um caixa aberto. Feche o caixa atual antes de abrir outro.');
      }

      const sessionResult = await client.query<CashSessionRecord>(
        `
          insert into public.cash_sessions (
            status,
            opening_amount,
            expected_amount,
            notes,
            opened_by
          )
          values ('open', $1, $1, $2, $3)
          returning
            id,
            reference_code,
            status,
            opening_amount,
            expected_amount,
            counted_amount,
            difference_amount,
            notes,
            opened_by,
            null::text as opened_by_name,
            closed_by,
            null::text as closed_by_name,
            opened_at,
            closed_at,
            created_at,
            updated_at
        `,
        [dto.openingAmount, dto.notes ?? null, user.id],
      );

      const session = sessionResult.rows[0];

      if (dto.openingAmount > 0) {
        await client.query(
          `
            insert into public.cash_transactions (
              session_id,
              transaction_type,
              payment_method,
              amount,
              description,
              processed_by
            )
            values ($1, 'opening_float', 'cash', $2, $3, $4)
          `,
          [session.id, dto.openingAmount, 'Fundo inicial do caixa.', user.id],
        );
      }

      await this.refreshSessionExpectedAmount(client, session.id);
      await client.query('commit');

      return this.getOverview();
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async createTransaction(user: AuthenticatedUser, dto: CreateCashTransactionDto) {
    await this.profilesService.ensureProfile(user);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      const currentSession = await this.getCurrentSessionOrFail(client);
      const transactionType = dto.transactionType as CashTransactionType;
      const paymentMethod = this.resolvePaymentMethod(transactionType, dto.paymentMethod);
      const order = dto.orderId ? await this.getOrderForPayment(client, dto.orderId) : null;

      this.assertTransactionConsistency(transactionType, order, dto.amount);

      const description = this.buildTransactionDescription(transactionType, dto.description, order?.reference_code);

      await client.query(
        `
          insert into public.cash_transactions (
            session_id,
            order_id,
            transaction_type,
            payment_method,
            amount,
            description,
            processed_by
          )
          values ($1, $2, $3, $4, $5, $6, $7)
        `,
        [currentSession.id, order?.id ?? null, transactionType, paymentMethod, dto.amount, description, user.id],
      );

      if (order) {
        await this.syncOrderPayment(client, order, transactionType, paymentMethod);
      }

      await this.refreshSessionExpectedAmount(client, currentSession.id);
      await client.query('commit');

      return this.getOverview();
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async closeSession(user: AuthenticatedUser, dto: CloseCashSessionDto) {
    await this.profilesService.ensureProfile(user);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      const currentSession = await this.getCurrentSessionOrFail(client);
      const expectedAmount = await this.refreshSessionExpectedAmount(client, currentSession.id);
      const differenceAmount = dto.countedAmount - expectedAmount;

      await client.query(
        `
          update public.cash_sessions
          set
            status = 'closed',
            counted_amount = $2,
            difference_amount = $3,
            notes = coalesce($4, notes),
            closed_by = $5,
            closed_at = timezone('utc', now()),
            updated_at = timezone('utc', now())
          where id = $1
        `,
        [currentSession.id, dto.countedAmount, differenceAmount, dto.notes ?? null, user.id],
      );

      await client.query('commit');

      return this.getOverview();
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async findCurrentSession(client?: PoolClient, lockForUpdate = false) {
    const executor = client ?? this.pool;
    const lockClause = client && lockForUpdate ? 'for update of cs' : '';
    const result = await executor.query<CashSessionRecord>(
      `
        select
          cs.id,
          cs.reference_code,
          cs.status,
          cs.opening_amount,
          cs.expected_amount,
          cs.counted_amount,
          cs.difference_amount,
          cs.notes,
          cs.opened_by,
          opened.full_name as opened_by_name,
          cs.closed_by,
          closed.full_name as closed_by_name,
          cs.opened_at,
          cs.closed_at,
          cs.created_at,
          cs.updated_at
        from public.cash_sessions cs
        left join public.profiles opened on opened.id = cs.opened_by
        left join public.profiles closed on closed.id = cs.closed_by
        where cs.status = 'open'
        order by cs.opened_at desc
        limit 1
        ${lockClause}
      `,
    );

    return result.rows[0] ?? null;
  }

  private async getCurrentSessionOrFail(client: PoolClient) {
    const session = await this.findCurrentSession(client, true);

    if (!session) {
      throw new ConflictException('Abra o caixa antes de registrar pagamentos ou fechar o turno.');
    }

    return session;
  }

  private async listPendingOrders() {
    const result = await this.pool.query<PendingOrderRecord>(
      `
        select
          o.id,
          o.reference_code,
          o.customer_name,
          o.status,
          o.total_amount,
          o.payment_method,
          o.payment_status,
          o.paid_amount,
          greatest(o.total_amount - o.paid_amount, 0)::text as outstanding_amount,
          o.created_at
        from public.orders o
        where
          o.status <> 'cancelled'
          and o.payment_status in ('pending', 'partial')
        order by
          case
            when o.status = 'ready' then 0
            when o.status = 'preparing' then 1
            when o.status = 'confirmed' then 2
            when o.status = 'delivered' then 3
            else 4
          end,
          o.created_at asc
        limit 20
      `,
    );

    return result.rows.map((order) => ({
      id: order.id,
      referenceCode: order.reference_code,
      customerName: order.customer_name,
      status: order.status,
      totalAmount: Number(order.total_amount),
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      paidAmount: Number(order.paid_amount),
      outstandingAmount: Number(order.outstanding_amount),
      createdAt: order.created_at,
    }));
  }

  private async listRecentSessions() {
    const result = await this.pool.query<RecentSessionRow>(
      `
        select
          cs.id,
          cs.reference_code,
          cs.status,
          cs.opening_amount,
          cs.expected_amount,
          cs.counted_amount,
          cs.difference_amount,
          cs.notes,
          cs.opened_by,
          opened.full_name as opened_by_name,
          cs.closed_by,
          closed.full_name as closed_by_name,
          cs.opened_at,
          cs.closed_at,
          cs.created_at,
          cs.updated_at,
          count(tx.id)::int as transaction_count,
          coalesce(sum(case when tx.status = 'confirmed' and tx.transaction_type = 'sale' then tx.amount else 0 end), 0)::text as gross_sales
        from public.cash_sessions cs
        left join public.profiles opened on opened.id = cs.opened_by
        left join public.profiles closed on closed.id = cs.closed_by
        left join public.cash_transactions tx on tx.session_id = cs.id
        group by
          cs.id,
          cs.reference_code,
          cs.status,
          cs.opening_amount,
          cs.expected_amount,
          cs.counted_amount,
          cs.difference_amount,
          cs.notes,
          cs.opened_by,
          opened.full_name,
          cs.closed_by,
          closed.full_name,
          cs.opened_at,
          cs.closed_at,
          cs.created_at,
          cs.updated_at
        order by cs.opened_at desc
        limit 6
      `,
    );

    return result.rows.map((session) => ({
      ...this.toSessionResponse(session),
      transactionCount: session.transaction_count,
      grossSales: Number(session.gross_sales),
    }));
  }

  private async getSessionMetrics(session: CashSessionRecord) {
    const result = await this.pool.query<SessionMetricRow>(
      `
        select
          coalesce(sum(case when tx.transaction_type = 'sale' then tx.amount else 0 end), 0)::text as gross_sales,
          coalesce(sum(case when tx.transaction_type = 'refund' then tx.amount else 0 end), 0)::text as refunds,
          coalesce(sum(case when tx.transaction_type = 'cash_in' then tx.amount else 0 end), 0)::text as cash_entries,
          coalesce(sum(case when tx.transaction_type = 'cash_out' then tx.amount else 0 end), 0)::text as cash_exits,
          coalesce(sum(case when tx.transaction_type = 'sale' and tx.payment_method = 'cash' then tx.amount else 0 end), 0)::text as cash_sales,
          coalesce(sum(case when tx.transaction_type = 'refund' and tx.payment_method = 'cash' then tx.amount else 0 end), 0)::text as cash_refunds,
          coalesce(sum(case when tx.transaction_type = 'sale' and tx.payment_method = 'pix' then tx.amount else 0 end), 0)::text as pix_sales,
          coalesce(sum(case when tx.transaction_type = 'sale' and tx.payment_method = 'credit_card' then tx.amount else 0 end), 0)::text as credit_card_sales,
          coalesce(sum(case when tx.transaction_type = 'sale' and tx.payment_method = 'debit_card' then tx.amount else 0 end), 0)::text as debit_card_sales,
          coalesce(sum(case when tx.transaction_type = 'sale' and tx.payment_method = 'voucher' then tx.amount else 0 end), 0)::text as voucher_sales,
          count(*)::int as transaction_count
        from public.cash_transactions tx
        where tx.session_id = $1
          and tx.status = 'confirmed'
      `,
      [session.id],
    );

    const metrics = result.rows[0];

    return {
      openingAmount: Number(session.opening_amount),
      expectedDrawerAmount: Number(session.expected_amount),
      countedAmount: session.counted_amount ? Number(session.counted_amount) : null,
      differenceAmount: session.difference_amount ? Number(session.difference_amount) : null,
      grossSales: Number(metrics?.gross_sales ?? 0),
      refunds: Number(metrics?.refunds ?? 0),
      netSales: Number(metrics?.gross_sales ?? 0) - Number(metrics?.refunds ?? 0),
      cashEntries: Number(metrics?.cash_entries ?? 0),
      cashExits: Number(metrics?.cash_exits ?? 0),
      cashSales: Number(metrics?.cash_sales ?? 0),
      cashRefunds: Number(metrics?.cash_refunds ?? 0),
      pixSales: Number(metrics?.pix_sales ?? 0),
      creditCardSales: Number(metrics?.credit_card_sales ?? 0),
      debitCardSales: Number(metrics?.debit_card_sales ?? 0),
      voucherSales: Number(metrics?.voucher_sales ?? 0),
      transactionCount: metrics?.transaction_count ?? 0,
    };
  }

  private async listTransactionsBySession(sessionId: string, limit: number) {
    const result = await this.pool.query<CashTransactionRecord>(
      `
        select
          tx.id,
          tx.reference_code,
          tx.session_id,
          cs.reference_code as session_reference_code,
          tx.order_id,
          o.reference_code as order_reference_code,
          tx.transaction_type,
          tx.status,
          tx.payment_method,
          tx.amount,
          tx.description,
          tx.processed_by,
          p.full_name as processed_by_name,
          tx.created_at
        from public.cash_transactions tx
        inner join public.cash_sessions cs on cs.id = tx.session_id
        left join public.orders o on o.id = tx.order_id
        left join public.profiles p on p.id = tx.processed_by
        where tx.session_id = $1
        order by tx.created_at desc
        limit $2
      `,
      [sessionId, limit],
    );

    return result.rows.map((transaction) => this.toTransactionResponse(transaction));
  }

  private buildTransactionQuery(filters: TransactionFilters, summaryOnly: boolean) {
    const values: Array<string> = [];
    const where: string[] = ["tx.status = 'confirmed'"];

    if (filters.sessionId) {
      values.push(filters.sessionId);
      where.push(`tx.session_id = $${values.length}`);
    }

    if (filters.transactionType) {
      values.push(filters.transactionType);
      where.push(`tx.transaction_type = $${values.length}::public.cash_transaction_type`);
    }

    if (filters.paymentMethod) {
      values.push(filters.paymentMethod);
      where.push(`tx.payment_method = $${values.length}::public.payment_method`);
    }

    if (filters.dateFrom) {
      values.push(filters.dateFrom);
      where.push(`tx.created_at >= $${values.length}::timestamptz`);
    }

    if (filters.dateTo) {
      values.push(filters.dateTo);
      where.push(`tx.created_at < ($${values.length}::date + interval '1 day')`);
    }

    const whereClause = `where ${where.join(' and ')}`;

    if (summaryOnly) {
      return {
        text: `
          select
            coalesce(sum(case when tx.transaction_type = 'sale' then tx.amount else 0 end), 0)::text as gross_sales,
            coalesce(sum(case when tx.transaction_type = 'refund' then tx.amount else 0 end), 0)::text as refunds,
            coalesce(sum(case when tx.transaction_type = 'cash_in' then tx.amount else 0 end), 0)::text as cash_entries,
            coalesce(sum(case when tx.transaction_type = 'cash_out' then tx.amount else 0 end), 0)::text as cash_exits,
            coalesce(sum(case when tx.transaction_type = 'sale' and tx.payment_method = 'cash' then tx.amount else 0 end), 0)::text as cash_sales,
            coalesce(sum(case when tx.transaction_type = 'refund' and tx.payment_method = 'cash' then tx.amount else 0 end), 0)::text as cash_refunds,
            coalesce(sum(case when tx.transaction_type = 'sale' and tx.payment_method = 'pix' then tx.amount else 0 end), 0)::text as pix_sales,
            coalesce(sum(case when tx.transaction_type = 'sale' and tx.payment_method = 'credit_card' then tx.amount else 0 end), 0)::text as credit_card_sales,
            coalesce(sum(case when tx.transaction_type = 'sale' and tx.payment_method = 'debit_card' then tx.amount else 0 end), 0)::text as debit_card_sales,
            coalesce(sum(case when tx.transaction_type = 'sale' and tx.payment_method = 'voucher' then tx.amount else 0 end), 0)::text as voucher_sales,
            count(*)::int as transaction_count
          from public.cash_transactions tx
          ${whereClause}
        `,
        values,
      };
    }

    return {
      text: `
        select
          tx.id,
          tx.reference_code,
          tx.session_id,
          cs.reference_code as session_reference_code,
          tx.order_id,
          o.reference_code as order_reference_code,
          tx.transaction_type,
          tx.status,
          tx.payment_method,
          tx.amount,
          tx.description,
          tx.processed_by,
          p.full_name as processed_by_name,
          tx.created_at
        from public.cash_transactions tx
        inner join public.cash_sessions cs on cs.id = tx.session_id
        left join public.orders o on o.id = tx.order_id
        left join public.profiles p on p.id = tx.processed_by
        ${whereClause}
        order by tx.created_at desc
        limit 200
      `,
      values,
    };
  }

  private assertValidFilters(filters: TransactionFilters) {
    if (filters.dateFrom && Number.isNaN(Date.parse(filters.dateFrom))) {
      throw new BadRequestException('A data inicial do relatorio e invalida.');
    }

    if (filters.dateTo && Number.isNaN(Date.parse(filters.dateTo))) {
      throw new BadRequestException('A data final do relatorio e invalida.');
    }
  }

  private resolvePaymentMethod(
    transactionType: CashTransactionType,
    paymentMethod?: PaymentMethod,
  ): PaymentMethod {
    if (transactionType === 'cash_in' || transactionType === 'cash_out' || transactionType === 'opening_float') {
      return 'cash';
    }

    return paymentMethod ?? 'cash';
  }

  private async getOrderForPayment(client: PoolClient, orderId: string) {
    const result = await client.query<OrderPaymentRecord>(
      `
        select
          id,
          reference_code,
          status,
          total_amount,
          paid_amount,
          payment_status,
          payment_method
        from public.orders
        where id = $1
        limit 1
        for update
      `,
      [orderId],
    );

    const order = result.rows[0];

    if (!order) {
      throw new NotFoundException('Pedido nao encontrado para pagamento.');
    }

    return order;
  }

  private assertTransactionConsistency(
    transactionType: CashTransactionType,
    order: OrderPaymentRecord | null,
    amount: number,
  ) {
    if (transactionType === 'sale' || transactionType === 'refund') {
      if (!order) {
        throw new BadRequestException('Selecione um pedido para registrar o pagamento.');
      }
    }

    if ((transactionType === 'cash_in' || transactionType === 'cash_out') && order) {
      throw new BadRequestException('Ajustes de caixa nao podem ser vinculados a um pedido.');
    }

    if (!order) {
      return;
    }

    const totalAmount = Number(order.total_amount);
    const paidAmount = Number(order.paid_amount);
    const outstandingAmount = Math.max(totalAmount - paidAmount, 0);

    if (transactionType === 'sale') {
      if (order.status === 'cancelled') {
        throw new ConflictException('Nao e possivel registrar pagamento para um pedido cancelado.');
      }

      if (outstandingAmount <= 0) {
        throw new ConflictException('Este pedido ja foi quitado.');
      }

      if (amount > outstandingAmount) {
        throw new BadRequestException(`O valor excede o saldo pendente do pedido (${outstandingAmount.toFixed(2)}).`);
      }
    }

    if (transactionType === 'refund') {
      if (paidAmount <= 0) {
        throw new ConflictException('Nao ha valor pago para estornar neste pedido.');
      }

      if (amount > paidAmount) {
        throw new BadRequestException(`O estorno nao pode ser maior que o valor pago (${paidAmount.toFixed(2)}).`);
      }
    }
  }

  private buildTransactionDescription(
    transactionType: CashTransactionType,
    description?: string,
    orderReferenceCode?: string,
  ) {
    if (description && description.trim().length > 0) {
      return description.trim();
    }

    switch (transactionType) {
      case 'sale':
        return `Pagamento do pedido ${orderReferenceCode ?? ''}`.trim();
      case 'refund':
        return `Estorno do pedido ${orderReferenceCode ?? ''}`.trim();
      case 'cash_in':
        return 'Suprimento de caixa.';
      case 'cash_out':
        return 'Sangria de caixa.';
      case 'opening_float':
        return 'Fundo inicial do caixa.';
      default:
        return 'Movimentacao de caixa.';
    }
  }

  private async syncOrderPayment(
    client: PoolClient,
    order: OrderPaymentRecord,
    transactionType: CashTransactionType,
    paymentMethod: PaymentMethod,
  ) {
    const aggregateResult = await client.query<OrderPaymentAggregateRow>(
      `
        select
          coalesce(sum(case when transaction_type = 'sale' and status = 'confirmed' then amount else 0 end), 0)::text as sales_total,
          coalesce(sum(case when transaction_type = 'refund' and status = 'confirmed' then amount else 0 end), 0)::text as refund_total
        from public.cash_transactions
        where order_id = $1
      `,
      [order.id],
    );

    const aggregate = aggregateResult.rows[0];
    const salesTotal = Number(aggregate.sales_total);
    const refundTotal = Number(aggregate.refund_total);
    const netPaid = Math.max(salesTotal - refundTotal, 0);
    const totalAmount = Number(order.total_amount);

    let paymentStatus: PaymentStatus;

    if (netPaid === 0) {
      if (refundTotal > 0) {
        paymentStatus = 'refunded';
      } else if (order.status === 'cancelled') {
        paymentStatus = 'cancelled';
      } else {
        paymentStatus = 'pending';
      }
    } else if (netPaid < totalAmount) {
      paymentStatus = 'partial';
    } else {
      paymentStatus = 'paid';
    }

    const shouldSetPaymentMethod = transactionType === 'sale';

    await client.query(
      `
        update public.orders
        set
          paid_amount = $2,
          payment_status = $3::public.payment_status,
          payment_method = case
            when $4::public.payment_method is not null then $4::public.payment_method
            else payment_method
          end,
          paid_at = case
            when $5::boolean = true then coalesce(paid_at, timezone('utc', now()))
            else null
          end,
          updated_at = timezone('utc', now())
        where id = $1
      `,
      [order.id, netPaid, paymentStatus, shouldSetPaymentMethod ? paymentMethod : null, paymentStatus === 'paid'],
    );
  }

  private async refreshSessionExpectedAmount(client: PoolClient, sessionId: string) {
    const result = await client.query<DrawerBalanceRow>(
      `
        select
          (
            coalesce(sum(case when transaction_type = 'opening_float' then amount else 0 end), 0)
            + coalesce(sum(case when transaction_type = 'sale' and payment_method = 'cash' then amount else 0 end), 0)
            + coalesce(sum(case when transaction_type = 'cash_in' then amount else 0 end), 0)
            - coalesce(sum(case when transaction_type = 'cash_out' then amount else 0 end), 0)
            - coalesce(sum(case when transaction_type = 'refund' and payment_method = 'cash' then amount else 0 end), 0)
          )::text as expected_amount
        from public.cash_transactions
        where session_id = $1
          and status = 'confirmed'
      `,
      [sessionId],
    );

    const expectedAmount = Number(result.rows[0]?.expected_amount ?? 0);

    await client.query(
      `
        update public.cash_sessions
        set
          expected_amount = $2,
          updated_at = timezone('utc', now())
        where id = $1
      `,
      [sessionId, expectedAmount],
    );

    return expectedAmount;
  }

  private toSessionResponse(session: CashSessionRecord) {
    return {
      id: session.id,
      referenceCode: session.reference_code,
      status: session.status,
      openingAmount: Number(session.opening_amount),
      expectedAmount: Number(session.expected_amount),
      countedAmount: session.counted_amount ? Number(session.counted_amount) : null,
      differenceAmount: session.difference_amount ? Number(session.difference_amount) : null,
      notes: session.notes,
      openedBy: session.opened_by,
      openedByName: session.opened_by_name,
      closedBy: session.closed_by,
      closedByName: session.closed_by_name,
      openedAt: session.opened_at,
      closedAt: session.closed_at,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    };
  }

  private toTransactionResponse(transaction: CashTransactionRecord) {
    return {
      id: transaction.id,
      referenceCode: transaction.reference_code,
      sessionId: transaction.session_id,
      sessionReferenceCode: transaction.session_reference_code,
      orderId: transaction.order_id,
      orderReferenceCode: transaction.order_reference_code,
      transactionType: transaction.transaction_type,
      status: transaction.status,
      paymentMethod: transaction.payment_method,
      amount: Number(transaction.amount),
      description: transaction.description,
      processedBy: transaction.processed_by,
      processedByName: transaction.processed_by_name,
      createdAt: transaction.created_at,
    };
  }

  private emptyMetrics() {
    return {
      openingAmount: 0,
      expectedDrawerAmount: 0,
      countedAmount: null,
      differenceAmount: null,
      grossSales: 0,
      refunds: 0,
      netSales: 0,
      cashEntries: 0,
      cashExits: 0,
      cashSales: 0,
      cashRefunds: 0,
      pixSales: 0,
      creditCardSales: 0,
      debitCardSales: 0,
      voucherSales: 0,
      transactionCount: 0,
    };
  }
}
