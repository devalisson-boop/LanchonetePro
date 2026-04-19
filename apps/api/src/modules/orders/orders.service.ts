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
import { CreateOrderDto } from './dto/create-order.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';

type OrderStatus = 'draft' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
type OrderScope = 'all' | 'active' | 'closed';

type OrderListRecord = {
  id: string;
  reference_code: string;
  order_type: string;
  status: OrderStatus;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  table_id: string | null;
  table_name: string | null;
  subtotal: string;
  discount_amount: string;
  total_amount: string;
  payment_method: string | null;
  opened_by: string | null;
  closed_by: string | null;
  item_count: number;
  stock_deducted_at: string | null;
  printed_at: string | null;
  print_count: number;
  confirmed_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

type OrderItemRecord = {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: string;
  unit_price: string;
  total_price: string;
};

type OrderStatusHistoryRecord = {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  notes: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  created_at: string;
};

type ProductPriceRecord = {
  id: string;
  name: string;
  price: string;
  stock_quantity: string;
  minimum_stock_level: string;
  is_available: boolean;
};

type RecipeSnapshotRecord = {
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  recipe_quantity: string;
  cost_per_unit: string;
};

type OrderInventoryProductRow = {
  order_item_id: string;
  product_id: string;
  product_name: string;
  ordered_quantity: string;
  product_stock_quantity: string;
  product_minimum_stock_level: string;
  has_ingredient_snapshot: boolean;
};

type OrderItemIngredientSnapshotRow = {
  order_item_id: string;
  ingredient_id: string;
  ingredient_name: string;
  quantity: string;
  unit: string;
  cost_per_unit: string;
  stock_quantity: string;
};

type TableRow = {
  id: string;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning';
};

const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['confirmed', 'preparing', 'ready'];

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'ready', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

@Injectable()
export class OrdersService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(ProfilesService) private readonly profilesService: ProfilesService,
  ) {}

  async list(scope: OrderScope = 'all', status?: OrderStatus) {
    const normalizedScope = this.normalizeScope(scope);
    const result = await this.pool.query<OrderListRecord>(
      `
        select
          o.id,
          o.reference_code,
          o.order_type,
          o.status,
          o.customer_name,
          o.customer_phone,
          o.notes,
          o.table_id,
          t.name as table_name,
          o.subtotal,
          o.discount_amount,
          o.total_amount,
          o.payment_method,
          o.opened_by,
          o.closed_by,
          (
            select count(*)::int
            from public.order_items oi
            where oi.order_id = o.id
          ) as item_count,
          o.stock_deducted_at,
          o.printed_at,
          coalesce(o.print_count, 0) as print_count,
          o.confirmed_at,
          o.preparing_at,
          o.ready_at,
          o.delivered_at,
          o.cancelled_at,
          o.created_at,
          o.updated_at
        from public.orders o
        left join public.customer_tables t on t.id = o.table_id
        where (
          $1::text is not null and o.status = $1::public.order_status
        ) or (
          $1::text is null and (
            $2::text = 'all'
            or ($2::text = 'active' and o.status = any($3::public.order_status[]))
            or ($2::text = 'closed' and o.status in ('delivered', 'cancelled'))
          )
        )
        order by
          case when o.status = any($3::public.order_status[]) then 0 else 1 end,
          o.created_at desc
        limit 100
      `,
      [status ?? null, normalizedScope, ACTIVE_ORDER_STATUSES],
    );

    return this.hydrateOrders(result.rows);
  }

  async findById(id: string) {
    const result = await this.pool.query<OrderListRecord>(
      `
        select
          o.id,
          o.reference_code,
          o.order_type,
          o.status,
          o.customer_name,
          o.customer_phone,
          o.notes,
          o.table_id,
          t.name as table_name,
          o.subtotal,
          o.discount_amount,
          o.total_amount,
          o.payment_method,
          o.opened_by,
          o.closed_by,
          (
            select count(*)::int
            from public.order_items oi
            where oi.order_id = o.id
          ) as item_count,
          o.stock_deducted_at,
          o.printed_at,
          coalesce(o.print_count, 0) as print_count,
          o.confirmed_at,
          o.preparing_at,
          o.ready_at,
          o.delivered_at,
          o.cancelled_at,
          o.created_at,
          o.updated_at
        from public.orders o
        left join public.customer_tables t on t.id = o.table_id
        where o.id = $1
        limit 1
      `,
      [id],
    );

    const orderRow = result.rows[0];

    if (!orderRow) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    const [itemsResult, historyResult] = await Promise.all([
      this.pool.query<OrderItemRecord>(
        `
          select
            id,
            order_id,
            product_id,
            product_name,
            quantity,
            unit_price,
            total_price
          from public.order_items
          where order_id = $1
          order by created_at asc
        `,
        [id],
      ),
      this.pool.query<OrderStatusHistoryRecord>(
        `
          select
            osh.id,
            osh.order_id,
            osh.from_status,
            osh.to_status,
            osh.notes,
            osh.changed_by,
            p.full_name as changed_by_name,
            osh.created_at
          from public.order_status_history osh
          left join public.profiles p on p.id = osh.changed_by
          where osh.order_id = $1
          order by osh.created_at asc
        `,
        [id],
      ),
    ]);

    return this.toOrderResponse(orderRow, itemsResult.rows, historyResult.rows);
  }

  async create(user: AuthenticatedUser, dto: CreateOrderDto) {
    await this.profilesService.ensureProfile(user);

    if (dto.orderType === 'table' && !dto.tableId) {
      throw new BadRequestException('Pedidos de mesa exigem uma mesa selecionada.');
    }

    const client = await this.pool.connect();

    try {
      await client.query('begin');

      if (dto.tableId) {
        await this.assertTableExists(client, dto.tableId);
      }

      const orderResult = await client.query<OrderListRecord>(
        `
          insert into public.orders (
            order_type,
            status,
            customer_name,
            customer_phone,
            notes,
            table_id,
            discount_amount,
            payment_method,
            opened_by,
            confirmed_at
          )
          values ($1, 'confirmed', $2, $3, $4, $5, $6, $7, $8, timezone('utc', now()))
          returning
            id,
            reference_code,
            order_type,
            status,
            customer_name,
            customer_phone,
            notes,
            table_id,
            null::text as table_name,
            subtotal,
            discount_amount,
            total_amount,
            payment_method,
            opened_by,
            closed_by,
            0::int as item_count,
            stock_deducted_at,
            printed_at,
            coalesce(print_count, 0) as print_count,
            confirmed_at,
            preparing_at,
            ready_at,
            delivered_at,
            cancelled_at,
            created_at,
            updated_at
        `,
        [
          dto.orderType,
          dto.customerName ?? null,
          dto.customerPhone ?? null,
          dto.notes ?? null,
          dto.tableId ?? null,
          dto.discountAmount ?? 0,
          dto.paymentMethod ?? null,
          user.id,
        ],
      );

      const order = orderResult.rows[0];
      let subtotal = 0;

      for (const item of dto.items) {
        const product = await this.getAvailableProduct(client, item.productId);
        const unitPrice = Number(product.price);
        const totalPrice = unitPrice * item.quantity;
        subtotal += totalPrice;

        const orderItemResult = await client.query<{ id: string }>(
          `
            insert into public.order_items (
              order_id,
              product_id,
              product_name,
              quantity,
              unit_price,
              total_price
            )
            values ($1, $2, $3, $4, $5, $6)
            returning id
          `,
          [order.id, item.productId, product.name, item.quantity, unitPrice, totalPrice],
        );

        await this.snapshotOrderItemIngredients(client, orderItemResult.rows[0].id, item.productId, item.quantity);
      }

      const discountAmount = dto.discountAmount ?? 0;

      if (discountAmount > subtotal) {
        throw new BadRequestException('O desconto nao pode ser maior que o subtotal do pedido.');
      }

      await client.query(
        `
          update public.orders
          set
            subtotal = $2,
            total_amount = $3,
            updated_at = timezone('utc', now())
          where id = $1
        `,
        [order.id, subtotal, subtotal - discountAmount],
      );

      await this.consumeInventoryForOrder(client, order.id, order.reference_code, user.id);
      await this.logStatusChange(client, order.id, null, 'confirmed', user.id, dto.notes ?? null);
      await this.syncTableStatus(client, order.table_id, order.id, 'confirmed');

      await client.query('commit');
      return this.findById(order.id);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateStatus(user: AuthenticatedUser, id: string, dto: UpdateOrderStatusDto) {
    await this.profilesService.ensureProfile(user);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      const currentOrder = await this.getOrderForUpdate(client, id);

      if (currentOrder.status === dto.status) {
        if (dto.notes) {
          await client.query(
            `
              update public.orders
              set
                notes = $2,
                updated_at = timezone('utc', now())
              where id = $1
            `,
            [id, dto.notes],
          );
        }

        await client.query('commit');
        return this.findById(id);
      }

      this.assertStatusTransition(currentOrder.status, dto.status);

      if (ACTIVE_ORDER_STATUSES.includes(dto.status) && !currentOrder.stock_deducted_at) {
        await this.consumeInventoryForOrder(client, currentOrder.id, currentOrder.reference_code, user.id);
      }

      if (dto.status === 'cancelled' && currentOrder.stock_deducted_at) {
        await this.restoreInventoryForOrder(client, currentOrder.id, currentOrder.reference_code, user.id);
      }

      await client.query(
        `
          update public.orders
          set
            status = $2::public.order_status,
            notes = coalesce($3, notes),
            confirmed_at = case
              when $2::public.order_status = 'confirmed'::public.order_status and confirmed_at is null
                then timezone('utc', now())
              else confirmed_at
            end,
            preparing_at = case
              when $2::public.order_status = 'preparing'::public.order_status and preparing_at is null
                then timezone('utc', now())
              else preparing_at
            end,
            ready_at = case
              when $2::public.order_status = 'ready'::public.order_status and ready_at is null
                then timezone('utc', now())
              else ready_at
            end,
            delivered_at = case
              when $2::public.order_status = 'delivered'::public.order_status then timezone('utc', now())
              else delivered_at
            end,
            cancelled_at = case
              when $2::public.order_status = 'cancelled'::public.order_status then timezone('utc', now())
              else cancelled_at
            end,
            closed_by = case
              when $2::public.order_status in ('delivered'::public.order_status, 'cancelled'::public.order_status)
                then $4
              else closed_by
            end,
            updated_at = timezone('utc', now())
          where id = $1
        `,
        [id, dto.status, dto.notes ?? null, user.id],
      );

      await this.logStatusChange(client, id, currentOrder.status, dto.status, user.id, dto.notes ?? null);
      await this.syncTableStatus(client, currentOrder.table_id, currentOrder.id, dto.status);

      await client.query('commit');
      return this.findById(id);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async printTicket(user: AuthenticatedUser, id: string) {
    await this.profilesService.ensureProfile(user);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      const order = await this.getOrderForUpdate(client, id);

      await client.query(
        `
          update public.orders
          set
            printed_at = timezone('utc', now()),
            printed_by = $2,
            print_count = coalesce(print_count, 0) + 1,
            updated_at = timezone('utc', now())
          where id = $1
        `,
        [order.id, user.id],
      );

      await client.query('commit');
      return this.findById(id);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async hydrateOrders(orderRows: OrderListRecord[]) {
    if (orderRows.length === 0) {
      return [];
    }

    const orderIds = orderRows.map((order) => order.id);
    const itemsResult = await this.pool.query<OrderItemRecord>(
      `
        select
          id,
          order_id,
          product_id,
          product_name,
          quantity,
          unit_price,
          total_price
        from public.order_items
        where order_id = any($1::uuid[])
        order by created_at asc
      `,
      [orderIds],
    );

    const itemsByOrderId = new Map<string, OrderItemRecord[]>();

    for (const item of itemsResult.rows) {
      const current = itemsByOrderId.get(item.order_id) ?? [];
      current.push(item);
      itemsByOrderId.set(item.order_id, current);
    }

    return orderRows.map((orderRow) => this.toOrderResponse(orderRow, itemsByOrderId.get(orderRow.id) ?? []));
  }

  private toOrderResponse(
    order: OrderListRecord,
    items: OrderItemRecord[],
    history: OrderStatusHistoryRecord[] = [],
  ) {
    return {
      id: order.id,
      referenceCode: order.reference_code,
      orderType: order.order_type,
      status: order.status,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      notes: order.notes,
      tableId: order.table_id,
      tableName: order.table_name,
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discount_amount),
      totalAmount: Number(order.total_amount),
      paymentMethod: order.payment_method,
      openedBy: order.opened_by,
      closedBy: order.closed_by,
      itemCount: order.item_count,
      stockDeductedAt: order.stock_deducted_at,
      printedAt: order.printed_at,
      printCount: order.print_count,
      confirmedAt: order.confirmed_at,
      preparingAt: order.preparing_at,
      readyAt: order.ready_at,
      deliveredAt: order.delivered_at,
      cancelledAt: order.cancelled_at,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      availableTransitions: this.getAvailableTransitions(order.status),
      items: items.map((item) => ({
        id: item.id,
        productId: item.product_id,
        productName: item.product_name,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        totalPrice: Number(item.total_price),
      })),
      statusHistory: history.map((entry) => ({
        id: entry.id,
        fromStatus: entry.from_status,
        toStatus: entry.to_status,
        notes: entry.notes,
        changedBy: entry.changed_by,
        changedByName: entry.changed_by_name,
        createdAt: entry.created_at,
      })),
    };
  }

  private getAvailableTransitions(status: OrderStatus) {
    return STATUS_TRANSITIONS[status] ?? [];
  }

  private normalizeScope(scope: OrderScope) {
    if (scope === 'active' || scope === 'closed') {
      return scope;
    }

    return 'all';
  }

  private assertStatusTransition(currentStatus: OrderStatus, nextStatus: OrderStatus) {
    const allowedTransitions = this.getAvailableTransitions(currentStatus);

    if (!allowedTransitions.includes(nextStatus)) {
      throw new ConflictException(`Transicao invalida de ${currentStatus} para ${nextStatus}.`);
    }
  }

  private async getAvailableProduct(client: PoolClient, productId: string) {
    const result = await client.query<ProductPriceRecord>(
      `
        select
          id,
          name,
          price,
          stock_quantity,
          minimum_stock_level,
          is_available
        from public.products
        where id = $1
        limit 1
      `,
      [productId],
    );

    const product = result.rows[0];

    if (!product || !product.is_available) {
      throw new NotFoundException(`Produto ${productId} nao encontrado ou indisponivel.`);
    }

    return product;
  }

  private async snapshotOrderItemIngredients(
    client: PoolClient,
    orderItemId: string,
    productId: string,
    orderedQuantity: number,
  ) {
    const recipeResult = await client.query<RecipeSnapshotRecord>(
      `
        select
          si.id as ingredient_id,
          si.name as ingredient_name,
          si.unit,
          pi.quantity as recipe_quantity,
          si.cost_per_unit
        from public.product_ingredients pi
        inner join public.stock_items si on si.id = pi.ingredient_id
        where pi.product_id = $1
        order by si.name asc
      `,
      [productId],
    );

    for (const recipeItem of recipeResult.rows) {
      await client.query(
        `
          insert into public.order_item_ingredients (
            order_item_id,
            ingredient_id,
            ingredient_name,
            unit,
            quantity,
            cost_per_unit
          )
          values ($1, $2, $3, $4, $5, $6)
        `,
        [
          orderItemId,
          recipeItem.ingredient_id,
          recipeItem.ingredient_name,
          recipeItem.unit,
          Number(recipeItem.recipe_quantity) * orderedQuantity,
          Number(recipeItem.cost_per_unit),
        ],
      );
    }
  }

  private async consumeInventoryForOrder(
    client: PoolClient,
    orderId: string,
    referenceCode: string,
    userId: string,
  ) {
    const productRows = await this.getOrderInventoryProducts(client, orderId);
    const ingredientRows = await this.getOrderItemIngredientSnapshots(client, productRows.map((row) => row.order_item_id));

    const ingredientUsage = new Map<
      string,
      {
        ingredientId: string;
        ingredientName: string;
        required: number;
        unit: string;
        stockQuantity: number;
      }
    >();

    for (const row of ingredientRows) {
      const current = ingredientUsage.get(row.ingredient_id) ?? {
        ingredientId: row.ingredient_id,
        ingredientName: row.ingredient_name,
        required: 0,
        unit: row.unit,
        stockQuantity: Number(row.stock_quantity),
      };

      current.required += Number(row.quantity);
      ingredientUsage.set(row.ingredient_id, current);
    }

    for (const ingredient of ingredientUsage.values()) {
      if (ingredient.stockQuantity < ingredient.required) {
        throw new ConflictException(
          `Estoque insuficiente para ${ingredient.ingredientName}. Necessario ${ingredient.required} ${ingredient.unit}.`,
        );
      }
    }

    const productUsage = new Map<
      string,
      {
        productId: string;
        productName: string;
        required: number;
        stockQuantity: number;
        minimumStockLevel: number;
      }
    >();

    for (const row of productRows) {
      if (row.has_ingredient_snapshot) {
        continue;
      }

      const productStockQuantity = Number(row.product_stock_quantity);
      const minimumStockLevel = Number(row.product_minimum_stock_level);
      const isStockControlled = productStockQuantity > 0 || minimumStockLevel > 0;

      if (!isStockControlled) {
        continue;
      }

      const current = productUsage.get(row.product_id) ?? {
        productId: row.product_id,
        productName: row.product_name,
        required: 0,
        stockQuantity: productStockQuantity,
        minimumStockLevel,
      };

      current.required += Number(row.ordered_quantity);
      productUsage.set(row.product_id, current);
    }

    for (const product of productUsage.values()) {
      if (product.stockQuantity < product.required) {
        throw new ConflictException(
          `Estoque insuficiente para ${product.productName}. Necessario ${product.required} unidades.`,
        );
      }
    }

    for (const ingredient of ingredientUsage.values()) {
      await client.query(
        `
          update public.stock_items
          set
            quantity = quantity - $2,
            updated_at = timezone('utc', now())
          where id = $1
        `,
        [ingredient.ingredientId, ingredient.required],
      );

      await client.query(
        `
          insert into public.stock_movements (
            stock_item_id,
            movement_type,
            quantity,
            reason,
            related_order_id,
            performed_by
          )
          values ($1, 'out', $2, $3, $4, $5)
        `,
        [
          ingredient.ingredientId,
          ingredient.required,
          `Consumo do pedido ${referenceCode}`,
          orderId,
          userId,
        ],
      );
    }

    for (const product of productUsage.values()) {
      await client.query(
        `
          update public.products
          set
            stock_quantity = stock_quantity - $2,
            updated_at = timezone('utc', now())
          where id = $1
        `,
        [product.productId, product.required],
      );
    }

    await client.query(
      `
        update public.orders
        set stock_deducted_at = timezone('utc', now())
        where id = $1
      `,
      [orderId],
    );
  }

  private async restoreInventoryForOrder(
    client: PoolClient,
    orderId: string,
    referenceCode: string,
    userId: string,
  ) {
    const productRows = await this.getOrderInventoryProducts(client, orderId);
    const ingredientRows = await this.getOrderItemIngredientSnapshots(client, productRows.map((row) => row.order_item_id));

    const ingredientUsage = new Map<
      string,
      {
        ingredientId: string;
        ingredientName: string;
        quantity: number;
      }
    >();

    for (const row of ingredientRows) {
      const current = ingredientUsage.get(row.ingredient_id) ?? {
        ingredientId: row.ingredient_id,
        ingredientName: row.ingredient_name,
        quantity: 0,
      };

      current.quantity += Number(row.quantity);
      ingredientUsage.set(row.ingredient_id, current);
    }

    const productUsage = new Map<
      string,
      {
        productId: string;
        quantity: number;
      }
    >();

    for (const row of productRows) {
      if (row.has_ingredient_snapshot) {
        continue;
      }

      const productStockQuantity = Number(row.product_stock_quantity);
      const minimumStockLevel = Number(row.product_minimum_stock_level);
      const isStockControlled = productStockQuantity > 0 || minimumStockLevel > 0;

      if (!isStockControlled) {
        continue;
      }

      const current = productUsage.get(row.product_id) ?? {
        productId: row.product_id,
        quantity: 0,
      };

      current.quantity += Number(row.ordered_quantity);
      productUsage.set(row.product_id, current);
    }

    for (const ingredient of ingredientUsage.values()) {
      await client.query(
        `
          update public.stock_items
          set
            quantity = quantity + $2,
            updated_at = timezone('utc', now())
          where id = $1
        `,
        [ingredient.ingredientId, ingredient.quantity],
      );

      await client.query(
        `
          insert into public.stock_movements (
            stock_item_id,
            movement_type,
            quantity,
            reason,
            related_order_id,
            performed_by
          )
          values ($1, 'in', $2, $3, $4, $5)
        `,
        [
          ingredient.ingredientId,
          ingredient.quantity,
          `Estorno do pedido ${referenceCode}`,
          orderId,
          userId,
        ],
      );
    }

    for (const product of productUsage.values()) {
      await client.query(
        `
          update public.products
          set
            stock_quantity = stock_quantity + $2,
            updated_at = timezone('utc', now())
          where id = $1
        `,
        [product.productId, product.quantity],
      );
    }

    await client.query(
      `
        update public.orders
        set stock_deducted_at = null
        where id = $1
      `,
      [orderId],
    );
  }

  private async getOrderInventoryProducts(client: PoolClient, orderId: string) {
    const result = await client.query<OrderInventoryProductRow>(
      `
        select
          oi.id as order_item_id,
          oi.product_id,
          oi.product_name,
          oi.quantity as ordered_quantity,
          p.stock_quantity as product_stock_quantity,
          p.minimum_stock_level as product_minimum_stock_level,
          exists(
            select 1
            from public.order_item_ingredients oii
            where oii.order_item_id = oi.id
          ) as has_ingredient_snapshot
        from public.order_items oi
        inner join public.products p on p.id = oi.product_id
        where oi.order_id = $1
      `,
      [orderId],
    );

    return result.rows;
  }

  private async getOrderItemIngredientSnapshots(client: PoolClient, orderItemIds: string[]) {
    if (orderItemIds.length === 0) {
      return [] as OrderItemIngredientSnapshotRow[];
    }

    const result = await client.query<OrderItemIngredientSnapshotRow>(
      `
        select
          oii.order_item_id,
          oii.ingredient_id,
          oii.ingredient_name,
          oii.quantity,
          oii.unit,
          oii.cost_per_unit,
          si.quantity as stock_quantity
        from public.order_item_ingredients oii
        inner join public.stock_items si on si.id = oii.ingredient_id
        where oii.order_item_id = any($1::uuid[])
      `,
      [orderItemIds],
    );

    return result.rows;
  }

  private async getOrderForUpdate(client: PoolClient, id: string) {
    const result = await client.query<OrderListRecord>(
      `
        select
          o.id,
          o.reference_code,
          o.order_type,
          o.status,
          o.customer_name,
          o.customer_phone,
          o.notes,
          o.table_id,
          t.name as table_name,
          o.subtotal,
          o.discount_amount,
          o.total_amount,
          o.payment_method,
          o.opened_by,
          o.closed_by,
          (
            select count(*)::int
            from public.order_items oi
            where oi.order_id = o.id
          ) as item_count,
          o.stock_deducted_at,
          o.printed_at,
          coalesce(o.print_count, 0) as print_count,
          o.confirmed_at,
          o.preparing_at,
          o.ready_at,
          o.delivered_at,
          o.cancelled_at,
          o.created_at,
          o.updated_at
        from public.orders o
        left join public.customer_tables t on t.id = o.table_id
        where o.id = $1
        for update of o
      `,
      [id],
    );

    const order = result.rows[0];

    if (!order) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    return order;
  }

  private async logStatusChange(
    client: PoolClient,
    orderId: string,
    fromStatus: OrderStatus | null,
    toStatus: OrderStatus,
    userId: string,
    notes?: string | null,
  ) {
    await client.query(
      `
        insert into public.order_status_history (
          order_id,
          from_status,
          to_status,
          notes,
          changed_by
        )
        values ($1, $2, $3, $4, $5)
      `,
      [orderId, fromStatus, toStatus, notes ?? null, userId],
    );
  }

  private async assertTableExists(client: PoolClient, tableId: string) {
    const result = await client.query<TableRow>(
      `
        select id, status
        from public.customer_tables
        where id = $1
        limit 1
      `,
      [tableId],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Mesa nao encontrada.');
    }

    return result.rows[0];
  }

  private async syncTableStatus(
    client: PoolClient,
    tableId: string | null,
    orderId: string,
    orderStatus: OrderStatus,
  ) {
    if (!tableId) {
      return;
    }

    await this.assertTableExists(client, tableId);

    if (ACTIVE_ORDER_STATUSES.includes(orderStatus)) {
      await client.query(
        `
          update public.customer_tables
          set
            status = 'occupied',
            updated_at = timezone('utc', now())
          where id = $1
        `,
        [tableId],
      );
      return;
    }

    const activeOrdersResult = await client.query<{ exists: boolean }>(
      `
        select exists(
          select 1
          from public.orders
          where table_id = $1
            and id <> $2
            and status = any($3::public.order_status[])
        ) as exists
      `,
      [tableId, orderId, ACTIVE_ORDER_STATUSES],
    );

    await client.query(
      `
        update public.customer_tables
        set
          status = $2,
          updated_at = timezone('utc', now())
        where id = $1
      `,
      [tableId, activeOrdersResult.rows[0]?.exists ? 'occupied' : 'available'],
    );
  }
}
