import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import { PG_POOL } from '../database/database.constants.js';

type StockOverviewKpiRow = {
  active_ingredients: number;
  low_stock_ingredients: number;
  out_of_stock_ingredients: number;
  suppliers_count: number;
  inventory_value: string;
};

type IngredientAlertRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  stock_quantity: string;
  minimum_stock_level: string;
  cost_per_unit: string;
  supplier_name: string | null;
  is_active: boolean;
  shortage_quantity: string;
  inventory_value: string;
  affected_products_count: number;
  alert_status: 'out' | 'low' | 'inactive';
  last_movement_at: string | null;
};

type ProductRiskRow = {
  id: string;
  name: string;
  category_name: string | null;
  issue_count: number;
  issue_ingredients: string[] | null;
};

type InactiveRecipeIngredientRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  supplier_name: string | null;
  products_count: number;
  product_names: string[] | null;
};

type MovementRow = {
  id: string;
  item_id: string;
  item_name: string;
  sku: string | null;
  unit: string;
  movement_type: 'in' | 'out' | 'adjustment';
  quantity: string;
  movement_value: string;
  reason: string | null;
  order_reference_code: string | null;
  performed_by_name: string | null;
  created_at: string;
};

type ReportSummaryRow = {
  movement_count: number;
  incoming_quantity: string;
  outgoing_quantity: string;
  adjustment_quantity: string;
  incoming_value: string;
  outgoing_value: string;
  adjustment_value: string;
};

type StockReportFilters = {
  dateFrom?: string;
  dateTo?: string;
  movementType?: 'in' | 'out' | 'adjustment';
  itemId?: string;
};

@Injectable()
export class StockService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getOverview() {
    const [
      overviewResult,
      outOfStockIngredients,
      lowStockIngredients,
      productsAtRisk,
      inactiveRecipeIngredients,
      recentMovements,
    ] = await Promise.all([
      this.pool.query<StockOverviewKpiRow>(
        `
          select
            count(*) filter (where si.is_active = true)::int as active_ingredients,
            count(*) filter (where si.is_active = true and si.quantity > 0 and si.quantity <= si.minimum_quantity)::int as low_stock_ingredients,
            count(*) filter (where si.is_active = true and si.quantity <= 0)::int as out_of_stock_ingredients,
            count(distinct si.supplier_name) filter (where coalesce(si.supplier_name, '') <> '')::int as suppliers_count,
            coalesce(sum(si.quantity * si.cost_per_unit), 0)::text as inventory_value
          from public.stock_items si
        `,
      ),
      this.listIngredientAlerts('out', 8),
      this.listIngredientAlerts('low', 10),
      this.listProductsAtRisk(10),
      this.listInactiveRecipeIngredients(8),
      this.listMovements({}, 12),
    ]);

    const overview = overviewResult.rows[0];

    return {
      kpis: {
        activeIngredients: overview?.active_ingredients ?? 0,
        lowStockIngredients: overview?.low_stock_ingredients ?? 0,
        outOfStockIngredients: overview?.out_of_stock_ingredients ?? 0,
        suppliersCount: overview?.suppliers_count ?? 0,
        inventoryValue: Number(overview?.inventory_value ?? 0),
        productsAtRisk: productsAtRisk.length,
      },
      alerts: {
        outOfStockIngredients,
        lowStockIngredients,
        productsAtRisk,
        inactiveRecipeIngredients,
      },
      recentMovements,
    };
  }

  async getReport(filters: StockReportFilters) {
    this.assertValidFilters(filters);

    const summaryQuery = this.buildMovementWhere(filters);
    const [summaryResult, movements, criticalItems] = await Promise.all([
      this.pool.query<ReportSummaryRow>(
        `
          select
            count(*)::int as movement_count,
            coalesce(sum(case when sm.movement_type = 'in' then sm.quantity else 0 end), 0)::text as incoming_quantity,
            coalesce(sum(case when sm.movement_type = 'out' then sm.quantity else 0 end), 0)::text as outgoing_quantity,
            coalesce(sum(case when sm.movement_type = 'adjustment' then sm.quantity else 0 end), 0)::text as adjustment_quantity,
            coalesce(sum(case when sm.movement_type = 'in' then sm.quantity * si.cost_per_unit else 0 end), 0)::text as incoming_value,
            coalesce(sum(case when sm.movement_type = 'out' then sm.quantity * si.cost_per_unit else 0 end), 0)::text as outgoing_value,
            coalesce(sum(case when sm.movement_type = 'adjustment' then sm.quantity * si.cost_per_unit else 0 end), 0)::text as adjustment_value
          from public.stock_movements sm
          inner join public.stock_items si on si.id = sm.stock_item_id
          ${summaryQuery.clause}
        `,
        summaryQuery.values,
      ),
      this.listMovements(filters, 200),
      this.listCriticalItems(20),
    ]);

    const summary = summaryResult.rows[0];
    const inventoryValueResult = await this.pool.query<{ inventory_value: string; low_stock_count: number; out_of_stock_count: number }>(
      `
        select
          coalesce(sum(si.quantity * si.cost_per_unit), 0)::text as inventory_value,
          count(*) filter (where si.is_active = true and si.quantity > 0 and si.quantity <= si.minimum_quantity)::int as low_stock_count,
          count(*) filter (where si.is_active = true and si.quantity <= 0)::int as out_of_stock_count
        from public.stock_items si
      `,
    );

    const inventory = inventoryValueResult.rows[0];

    return {
      summary: {
        movementCount: summary?.movement_count ?? 0,
        incomingQuantity: Number(summary?.incoming_quantity ?? 0),
        outgoingQuantity: Number(summary?.outgoing_quantity ?? 0),
        adjustmentQuantity: Number(summary?.adjustment_quantity ?? 0),
        incomingValue: Number(summary?.incoming_value ?? 0),
        outgoingValue: Number(summary?.outgoing_value ?? 0),
        adjustmentValue: Number(summary?.adjustment_value ?? 0),
        inventoryValue: Number(inventory?.inventory_value ?? 0),
        lowStockIngredients: inventory?.low_stock_count ?? 0,
        outOfStockIngredients: inventory?.out_of_stock_count ?? 0,
      },
      movements,
      criticalItems,
    };
  }

  private async listIngredientAlerts(status: 'out' | 'low', limit: number) {
    const result = await this.pool.query<IngredientAlertRow>(
      `
        select
          si.id,
          si.name,
          si.sku,
          si.unit,
          si.quantity as stock_quantity,
          si.minimum_quantity as minimum_stock_level,
          si.cost_per_unit,
          si.supplier_name,
          si.is_active,
          greatest(si.minimum_quantity - si.quantity, 0)::text as shortage_quantity,
          coalesce(si.quantity * si.cost_per_unit, 0)::text as inventory_value,
          count(distinct pi.product_id)::int as affected_products_count,
          $1::text as alert_status,
          max(sm.created_at) as last_movement_at
        from public.stock_items si
        left join public.product_ingredients pi on pi.ingredient_id = si.id
        left join public.stock_movements sm on sm.stock_item_id = si.id
        where
          si.is_active = true
          and (
            ($1::text = 'out' and si.quantity <= 0)
            or ($1::text = 'low' and si.quantity > 0 and si.quantity <= si.minimum_quantity)
          )
        group by
          si.id,
          si.name,
          si.sku,
          si.unit,
          si.quantity,
          si.minimum_quantity,
          si.cost_per_unit,
          si.supplier_name,
          si.is_active
        order by
          affected_products_count desc,
          si.quantity asc,
          si.name asc
        limit $2
      `,
      [status, limit],
    );

    return result.rows.map((row) => this.toIngredientAlert(row));
  }

  private async listProductsAtRisk(limit: number) {
    const result = await this.pool.query<ProductRiskRow>(
      `
        select
          p.id,
          p.name,
          c.name as category_name,
          count(distinct si.id)::int as issue_count,
          array_remove(array_agg(distinct si.name order by si.name), null) as issue_ingredients
        from public.products p
        left join public.categories c on c.id = p.category_id
        inner join public.product_ingredients pi on pi.product_id = p.id
        inner join public.stock_items si on si.id = pi.ingredient_id
        where
          p.is_available = true
          and (
            si.is_active = false
            or si.quantity <= si.minimum_quantity
          )
        group by p.id, p.name, c.name
        order by issue_count desc, p.name asc
        limit $1
      `,
      [limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      categoryName: row.category_name,
      issueCount: row.issue_count,
      issueIngredients: row.issue_ingredients ?? [],
    }));
  }

  private async listInactiveRecipeIngredients(limit: number) {
    const result = await this.pool.query<InactiveRecipeIngredientRow>(
      `
        select
          si.id,
          si.name,
          si.sku,
          si.unit,
          si.supplier_name,
          count(distinct pi.product_id)::int as products_count,
          array_remove(array_agg(distinct p.name order by p.name), null) as product_names
        from public.stock_items si
        inner join public.product_ingredients pi on pi.ingredient_id = si.id
        inner join public.products p on p.id = pi.product_id
        where si.is_active = false
        group by si.id, si.name, si.sku, si.unit, si.supplier_name
        order by products_count desc, si.name asc
        limit $1
      `,
      [limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      supplierName: row.supplier_name,
      productsCount: row.products_count,
      productNames: row.product_names ?? [],
    }));
  }

  private async listCriticalItems(limit: number) {
    const result = await this.pool.query<IngredientAlertRow>(
      `
        select
          si.id,
          si.name,
          si.sku,
          si.unit,
          si.quantity as stock_quantity,
          si.minimum_quantity as minimum_stock_level,
          si.cost_per_unit,
          si.supplier_name,
          si.is_active,
          greatest(si.minimum_quantity - si.quantity, 0)::text as shortage_quantity,
          coalesce(si.quantity * si.cost_per_unit, 0)::text as inventory_value,
          count(distinct pi.product_id)::int as affected_products_count,
          case
            when si.is_active = false and count(distinct pi.product_id) > 0 then 'inactive'
            when si.quantity <= 0 then 'out'
            else 'low'
          end::text as alert_status,
          max(sm.created_at) as last_movement_at
        from public.stock_items si
        left join public.product_ingredients pi on pi.ingredient_id = si.id
        left join public.stock_movements sm on sm.stock_item_id = si.id
        where
          (si.is_active = false and pi.product_id is not null)
          or (si.is_active = true and si.quantity <= si.minimum_quantity)
        group by
          si.id,
          si.name,
          si.sku,
          si.unit,
          si.quantity,
          si.minimum_quantity,
          si.cost_per_unit,
          si.supplier_name,
          si.is_active
        order by
          case
            when si.is_active = false and count(distinct pi.product_id) > 0 then 0
            when si.quantity <= 0 then 1
            else 2
          end,
          affected_products_count desc,
          si.quantity asc,
          si.name asc
        limit $1
      `,
      [limit],
    );

    return result.rows.map((row) => this.toIngredientAlert(row));
  }

  private async listMovements(filters: StockReportFilters, limit: number) {
    const { clause, values } = this.buildMovementWhere(filters);
    values.push(String(limit));

    const result = await this.pool.query<MovementRow>(
      `
        select
          sm.id,
          si.id as item_id,
          si.name as item_name,
          si.sku,
          si.unit,
          sm.movement_type,
          sm.quantity,
          coalesce(sm.quantity * si.cost_per_unit, 0)::text as movement_value,
          sm.reason,
          o.reference_code as order_reference_code,
          p.full_name as performed_by_name,
          sm.created_at
        from public.stock_movements sm
        inner join public.stock_items si on si.id = sm.stock_item_id
        left join public.orders o on o.id = sm.related_order_id
        left join public.profiles p on p.id = sm.performed_by
        ${clause}
        order by sm.created_at desc
        limit $${values.length}
      `,
      values,
    );

    return result.rows.map((row) => ({
      id: row.id,
      itemId: row.item_id,
      itemName: row.item_name,
      sku: row.sku,
      unit: row.unit,
      movementType: row.movement_type,
      quantity: Number(row.quantity),
      movementValue: Number(row.movement_value),
      reason: row.reason,
      orderReferenceCode: row.order_reference_code,
      performedByName: row.performed_by_name,
      createdAt: row.created_at,
    }));
  }

  private buildMovementWhere(filters: StockReportFilters) {
    const values: string[] = [];
    const conditions: string[] = [];

    if (filters.dateFrom) {
      values.push(filters.dateFrom);
      conditions.push(`sm.created_at >= $${values.length}::timestamptz`);
    }

    if (filters.dateTo) {
      values.push(filters.dateTo);
      conditions.push(`sm.created_at < ($${values.length}::date + interval '1 day')`);
    }

    if (filters.movementType) {
      values.push(filters.movementType);
      conditions.push(`sm.movement_type = $${values.length}::public.stock_movement_type`);
    }

    if (filters.itemId) {
      values.push(filters.itemId);
      conditions.push(`sm.stock_item_id = $${values.length}::uuid`);
    }

    return {
      clause: conditions.length > 0 ? `where ${conditions.join(' and ')}` : '',
      values,
    };
  }

  private assertValidFilters(filters: StockReportFilters) {
    if (filters.dateFrom && Number.isNaN(Date.parse(filters.dateFrom))) {
      throw new BadRequestException('A data inicial do relatorio de estoque e invalida.');
    }

    if (filters.dateTo && Number.isNaN(Date.parse(filters.dateTo))) {
      throw new BadRequestException('A data final do relatorio de estoque e invalida.');
    }
  }

  private toIngredientAlert(row: IngredientAlertRow) {
    return {
      id: row.id,
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      stockQuantity: Number(row.stock_quantity),
      minimumStockLevel: Number(row.minimum_stock_level),
      costPerUnit: Number(row.cost_per_unit),
      supplierName: row.supplier_name,
      isActive: row.is_active,
      shortageQuantity: Number(row.shortage_quantity),
      inventoryValue: Number(row.inventory_value),
      affectedProductsCount: row.affected_products_count,
      alertStatus: row.alert_status,
      lastMovementAt: row.last_movement_at,
    };
  }
}
