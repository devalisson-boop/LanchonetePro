alter table public.order_items
  add column if not exists product_name text;

alter table public.stock_items
  alter column quantity type numeric(12, 3),
  alter column minimum_quantity type numeric(12, 3);

alter table public.stock_movements
  alter column quantity type numeric(12, 3);

update public.order_items oi
set product_name = p.name
from public.products p
where p.id = oi.product_id
  and (oi.product_name is null or oi.product_name = '');

alter table public.order_items
  alter column product_name set not null;

create table if not exists public.order_item_ingredients (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  ingredient_id uuid not null references public.stock_items (id) on delete restrict,
  ingredient_name text not null,
  unit text not null,
  quantity numeric(12, 3) not null,
  cost_per_unit numeric(12, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_order_item_ingredients_order_item_id on public.order_item_ingredients (order_item_id);
create index if not exists idx_order_item_ingredients_ingredient_id on public.order_item_ingredients (ingredient_id);

alter table public.orders
  add column if not exists confirmed_at timestamptz,
  add column if not exists preparing_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists stock_deducted_at timestamptz,
  add column if not exists printed_at timestamptz,
  add column if not exists print_count integer not null default 0;

alter table public.orders
  add column if not exists printed_by uuid references public.profiles (id) on delete set null;

update public.orders
set confirmed_at = coalesce(confirmed_at, created_at)
where status in ('confirmed', 'preparing', 'ready', 'delivered');

update public.orders
set preparing_at = coalesce(preparing_at, updated_at)
where status in ('preparing', 'ready', 'delivered');

update public.orders
set ready_at = coalesce(ready_at, updated_at)
where status in ('ready', 'delivered');

update public.orders
set delivered_at = coalesce(delivered_at, updated_at)
where status = 'delivered';

update public.orders
set cancelled_at = coalesce(cancelled_at, updated_at)
where status = 'cancelled';

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  notes text,
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_order_status_history_order_id on public.order_status_history (order_id);
create index if not exists idx_order_status_history_created_at on public.order_status_history (created_at desc);
