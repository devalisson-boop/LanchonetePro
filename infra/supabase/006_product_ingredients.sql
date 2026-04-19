alter table public.stock_items
  add column if not exists description text,
  add column if not exists supplier_name text,
  add column if not exists cost_per_unit numeric(12, 2) not null default 0,
  add column if not exists is_active boolean not null default true;

create table if not exists public.product_ingredients (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  ingredient_id uuid not null references public.stock_items (id) on delete restrict,
  quantity numeric(12, 3) not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (product_id, ingredient_id)
);

create index if not exists idx_product_ingredients_product_id on public.product_ingredients (product_id);
create index if not exists idx_product_ingredients_ingredient_id on public.product_ingredients (ingredient_id);
create index if not exists idx_stock_items_is_active on public.stock_items (is_active);

drop trigger if exists trg_product_ingredients_updated_at on public.product_ingredients;

create trigger trg_product_ingredients_updated_at
  before update on public.product_ingredients
  for each row execute procedure public.set_updated_at();

insert into public.stock_items (
  name,
  sku,
  unit,
  quantity,
  minimum_quantity,
  supplier_name,
  cost_per_unit,
  is_active,
  description
)
values
  (
    'Pao Brioche',
    'ING-PBRIOCHE',
    'un',
    80,
    20,
    'Padaria Parceira',
    1.40,
    true,
    'Pao brioche para lanches.'
  ),
  (
    'Hamburguer Bovino 160g',
    'ING-HAMB160',
    'un',
    60,
    15,
    'Acougue Central',
    6.10,
    true,
    'Blend bovino de 160g.'
  ),
  (
    'Queijo',
    'ING-QUEIJO',
    'fatia',
    200,
    40,
    'Laticinios Serra',
    0.85,
    true,
    'Fatias de queijo para montagem.'
  ),
  (
    'Batata Congelada',
    'ING-BATATA',
    'kg',
    18,
    5,
    'Distribuidora Norte',
    13.90,
    true,
    'Batata pre-frita congelada.'
  )
on conflict (sku) do update
set
  name = excluded.name,
  unit = excluded.unit,
  quantity = excluded.quantity,
  minimum_quantity = excluded.minimum_quantity,
  supplier_name = excluded.supplier_name,
  cost_per_unit = excluded.cost_per_unit,
  is_active = excluded.is_active,
  description = excluded.description;

insert into public.product_ingredients (product_id, ingredient_id, quantity)
select
  p.id,
  s.id,
  case
    when s.sku = 'ING-PBRIOCHE' then 1
    when s.sku = 'ING-HAMB160' then 1
    when s.sku = 'ING-QUEIJO' then 2
    else 0
  end
from public.products p
cross join public.stock_items s
where p.slug = 'x-burger-casa'
  and s.sku in ('ING-PBRIOCHE', 'ING-HAMB160', 'ING-QUEIJO')
on conflict (product_id, ingredient_id) do update
set quantity = excluded.quantity;

insert into public.product_ingredients (product_id, ingredient_id, quantity)
select
  p.id,
  s.id,
  0.18
from public.products p
inner join public.stock_items s on s.sku = 'ING-BATATA'
where p.slug = 'batata-crocante'
on conflict (product_id, ingredient_id) do update
set quantity = excluded.quantity;

