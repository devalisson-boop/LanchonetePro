import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import { PG_POOL } from '../database/database.constants.js';

type SummaryRow = {
  today_revenue: string;
  month_revenue: string;
  open_orders: string;
  active_products: string;
  low_stock_products: string;
};

type RecentOrderRow = {
  id: string;
  reference_code: string;
  customer_name: string | null;
  status: string;
  total_amount: string;
  created_at: string;
};

type AnalyticsSummaryRow = {
  gross_revenue: string;
  paid_revenue: string;
  total_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  average_ticket: string;
  average_prep_minutes: string;
};

type RevenueSeriesRow = {
  day: string;
  label: string;
  revenue: string;
  orders: number;
};

type StatusBreakdownRow = {
  status: string;
  count: number;
  revenue: string;
};

type PaymentBreakdownRow = {
  payment_method: string;
  amount: string;
  orders: number;
};

type TopProductRow = {
  product_id: string;
  product_name: string;
  quantity_sold: string;
  revenue: string;
};

type HourlyPerformanceRow = {
  hour: number;
  orders: number;
  revenue: string;
};

@Injectable()
export class DashboardService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getSummary() {
    const [summaryResult, recentOrdersResult] = await Promise.all([
      this.pool.query<SummaryRow>(
        `
          select
            coalesce(sum(case when o.created_at::date = current_date and o.status <> 'cancelled' then o.total_amount else 0 end), 0)::text as today_revenue,
            coalesce(sum(case when date_trunc('month', o.created_at) = date_trunc('month', now()) and o.status <> 'cancelled' then o.total_amount else 0 end), 0)::text as month_revenue,
            count(*) filter (where o.status in ('confirmed', 'preparing', 'ready'))::text as open_orders,
            (select count(*)::text from public.products where is_available = true) as active_products,
            (select count(*)::text from public.products where stock_quantity <= minimum_stock_level) as low_stock_products
          from public.orders o
        `,
      ),
      this.pool.query<RecentOrderRow>(
        `
          select
            id,
            reference_code,
            customer_name,
            status,
            total_amount,
            created_at
          from public.orders
          order by created_at desc
          limit 8
        `,
      ),
    ]);

    const summary = summaryResult.rows[0];

    return {
      kpis: {
        todayRevenue: Number(summary.today_revenue),
        monthRevenue: Number(summary.month_revenue),
        openOrders: Number(summary.open_orders),
        activeProducts: Number(summary.active_products),
        lowStockProducts: Number(summary.low_stock_products),
      },
      recentOrders: recentOrdersResult.rows.map((order) => ({
        id: order.id,
        referenceCode: order.reference_code,
        customerName: order.customer_name,
        status: order.status,
        totalAmount: Number(order.total_amount),
        createdAt: order.created_at,
      })),
    };
  }

  async getAnalytics(days?: string) {
    const normalizedDays = this.normalizeDays(days);
    const rangeStart = new Date();
    rangeStart.setHours(0, 0, 0, 0);
    rangeStart.setDate(rangeStart.getDate() - normalizedDays + 1);

    const rangeEnd = new Date();
    rangeEnd.setHours(23, 59, 59, 999);

    const rangeStartDate = rangeStart.toISOString().slice(0, 10);
    const rangeEndDate = rangeEnd.toISOString().slice(0, 10);

    const [summaryResult, revenueSeriesResult, statusBreakdownResult, paymentBreakdownResult, topProductsResult, hourlyPerformanceResult] =
      await Promise.all([
        this.pool.query<AnalyticsSummaryRow>(
          `
            select
              coalesce(sum(case when o.status <> 'cancelled' then o.total_amount else 0 end), 0)::text as gross_revenue,
              coalesce(sum(case when o.status <> 'cancelled' then o.paid_amount else 0 end), 0)::text as paid_revenue,
              count(*) filter (where o.status <> 'cancelled')::int as total_orders,
              count(*) filter (where o.status = 'delivered')::int as completed_orders,
              count(*) filter (where o.status = 'cancelled')::int as cancelled_orders,
              coalesce(avg(case when o.status <> 'cancelled' then o.total_amount end), 0)::text as average_ticket,
              coalesce(
                avg(
                  case
                    when o.confirmed_at is not null and coalesce(o.ready_at, o.delivered_at) is not null
                      then extract(epoch from (coalesce(o.ready_at, o.delivered_at) - o.confirmed_at)) / 60
                    else null
                  end
                ),
                0
              )::text as average_prep_minutes
            from public.orders o
            where o.created_at::date between $1::date and $2::date
          `,
          [rangeStartDate, rangeEndDate],
        ),
        this.pool.query<RevenueSeriesRow>(
          `
            with calendar as (
              select generate_series($1::date, $2::date, interval '1 day')::date as day
            )
            select
              c.day::text as day,
              to_char(c.day, 'DD/MM') as label,
              coalesce(sum(case when o.status <> 'cancelled' then o.total_amount else 0 end), 0)::text as revenue,
              count(o.id) filter (where o.status <> 'cancelled')::int as orders
            from calendar c
            left join public.orders o on o.created_at::date = c.day
            group by c.day
            order by c.day asc
          `,
          [rangeStartDate, rangeEndDate],
        ),
        this.pool.query<StatusBreakdownRow>(
          `
            select
              o.status::text as status,
              count(*)::int as count,
              coalesce(sum(o.total_amount), 0)::text as revenue
            from public.orders o
            where o.created_at::date between $1::date and $2::date
            group by o.status
            order by count desc, status asc
          `,
          [rangeStartDate, rangeEndDate],
        ),
        this.pool.query<PaymentBreakdownRow>(
          `
            select
              coalesce(o.payment_method::text, 'unassigned') as payment_method,
              coalesce(sum(o.paid_amount), 0)::text as amount,
              count(*) filter (where o.paid_amount > 0)::int as orders
            from public.orders o
            where o.created_at::date between $1::date and $2::date
            group by coalesce(o.payment_method::text, 'unassigned')
            order by amount desc, payment_method asc
          `,
          [rangeStartDate, rangeEndDate],
        ),
        this.pool.query<TopProductRow>(
          `
            select
              oi.product_id,
              oi.product_name,
              coalesce(sum(oi.quantity), 0)::text as quantity_sold,
              coalesce(sum(oi.total_price), 0)::text as revenue
            from public.order_items oi
            inner join public.orders o on o.id = oi.order_id
            where
              o.created_at::date between $1::date and $2::date
              and o.status <> 'cancelled'
            group by oi.product_id, oi.product_name
            order by sum(oi.total_price) desc, sum(oi.quantity) desc, oi.product_name asc
            limit 8
          `,
          [rangeStartDate, rangeEndDate],
        ),
        this.pool.query<HourlyPerformanceRow>(
          `
            with hours as (
              select generate_series(0, 23) as hour
            )
            select
              h.hour,
              count(o.id) filter (where o.status <> 'cancelled')::int as orders,
              coalesce(sum(case when o.status <> 'cancelled' then o.total_amount else 0 end), 0)::text as revenue
            from hours h
            left join public.orders o
              on extract(hour from (o.created_at at time zone 'America/Sao_Paulo'))::int = h.hour
              and o.created_at::date between $1::date and $2::date
            group by h.hour
            order by h.hour asc
          `,
          [rangeStartDate, rangeEndDate],
        ),
      ]);

    const summary = summaryResult.rows[0];
    const totalOrders = summary?.total_orders ?? 0;
    const completedOrders = summary?.completed_orders ?? 0;
    const cancelledOrders = summary?.cancelled_orders ?? 0;

    return {
      period: {
        days: normalizedDays,
        dateFrom: rangeStartDate,
        dateTo: rangeEndDate,
      },
      kpis: {
        grossRevenue: Number(summary?.gross_revenue ?? 0),
        paidRevenue: Number(summary?.paid_revenue ?? 0),
        totalOrders,
        completedOrders,
        cancelledOrders,
        averageTicket: Number(summary?.average_ticket ?? 0),
        averagePrepMinutes: Number(summary?.average_prep_minutes ?? 0),
        completionRate: totalOrders > 0 ? completedOrders / totalOrders : 0,
      },
      revenueSeries: revenueSeriesResult.rows.map((row) => ({
        date: row.day,
        label: row.label,
        revenue: Number(row.revenue),
        orders: row.orders,
      })),
      statusBreakdown: statusBreakdownResult.rows.map((row) => ({
        status: row.status,
        count: row.count,
        revenue: Number(row.revenue),
      })),
      paymentBreakdown: paymentBreakdownResult.rows.map((row) => ({
        paymentMethod: row.payment_method,
        amount: Number(row.amount),
        orders: row.orders,
      })),
      topProducts: topProductsResult.rows.map((row) => ({
        productId: row.product_id,
        productName: row.product_name,
        quantitySold: Number(row.quantity_sold),
        revenue: Number(row.revenue),
      })),
      hourlyPerformance: hourlyPerformanceResult.rows.map((row) => ({
        hour: row.hour,
        orders: row.orders,
        revenue: Number(row.revenue),
      })),
    };
  }

  private normalizeDays(days?: string) {
    const parsedDays = Number(days);

    if (!Number.isFinite(parsedDays)) {
      return 14;
    }

    if (parsedDays <= 7) {
      return 7;
    }

    if (parsedDays <= 14) {
      return 14;
    }

    if (parsedDays <= 30) {
      return 30;
    }

    return 90;
  }
}
