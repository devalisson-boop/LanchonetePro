create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  price numeric(12, 2) not null default 0,
  cost_price numeric(12, 2),
  stock_quantity numeric(12, 2) not null default 0,
  minimum_stock_level numeric(12, 2) not null default 0,
  image_url text,
  is_available boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.customer_tables (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  seats integer not null default 4,
  status public.table_status not null default 'available',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique default public.generate_order_reference(),
  order_type public.order_type not null default 'counter',
  status public.order_status not null default 'draft',
  customer_name text,
  customer_phone text,
  notes text,
  table_id uuid references public.customer_tables (id) on delete set null,
  subtotal numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  payment_method public.payment_method,
  opened_by uuid references public.profiles (id) on delete set null,
  closed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity numeric(12, 2) not null,
  unit_price numeric(12, 2) not null,
  total_price numeric(12, 2) not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  unit text not null default 'un',
  quantity numeric(12, 2) not null default 0,
  minimum_quantity numeric(12, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.stock_items (id) on delete cascade,
  movement_type public.stock_movement_type not null,
  quantity numeric(12, 2) not null,
  reason text,
  related_order_id uuid references public.orders (id) on delete set null,
  performed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_products_category_id on public.products (category_id);
create index if not exists idx_products_is_available on public.products (is_available);
create index if not exists idx_orders_status_created_at on public.orders (status, created_at desc);
create index if not exists idx_orders_opened_by on public.orders (opened_by);
create index if not exists idx_order_items_order_id on public.order_items (order_id);
create index if not exists idx_stock_movements_stock_item_id on public.stock_movements (stock_item_id);

drop trigger if exists trg_categories_updated_at on public.categories;
drop trigger if exists trg_products_updated_at on public.products;
drop trigger if exists trg_customer_tables_updated_at on public.customer_tables;
drop trigger if exists trg_orders_updated_at on public.orders;
drop trigger if exists trg_stock_items_updated_at on public.stock_items;

create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute procedure public.set_updated_at();

create trigger trg_products_updated_at
  before update on public.products
  for each row execute procedure public.set_updated_at();

create trigger trg_customer_tables_updated_at
  before update on public.customer_tables
  for each row execute procedure public.set_updated_at();

create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute procedure public.set_updated_at();

create trigger trg_stock_items_updated_at
  before update on public.stock_items
  for each row execute procedure public.set_updated_at();

