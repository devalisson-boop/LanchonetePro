insert into public.categories (name, slug, description)
values
  ('Hamburgueres', 'hamburgueres', 'Linha principal de burgers artesanais.'),
  ('Porcoes', 'porcoes', 'Porcoes e acompanhamentos.'),
  ('Bebidas', 'bebidas', 'Refrigerantes, sucos e agua.')
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description;

insert into public.products (
  category_id,
  name,
  slug,
  description,
  price,
  cost_price,
  stock_quantity,
  minimum_stock_level,
  is_available
)
values
  (
    (select id from public.categories where slug = 'hamburgueres'),
    'X-Burger Casa',
    'x-burger-casa',
    'Pao brioche, burger 160g, queijo, alface e molho da casa.',
    29.90,
    14.30,
    18,
    5,
    true
  ),
  (
    (select id from public.categories where slug = 'porcoes'),
    'Batata Crocante',
    'batata-crocante',
    'Porcao media de batata frita crocante.',
    18.50,
    7.80,
    24,
    8,
    true
  ),
  (
    (select id from public.categories where slug = 'bebidas'),
    'Refrigerante Lata',
    'refrigerante-lata',
    'Lata 350ml.',
    7.50,
    3.20,
    48,
    12,
    true
  )
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  cost_price = excluded.cost_price,
  stock_quantity = excluded.stock_quantity,
  minimum_stock_level = excluded.minimum_stock_level,
  is_available = excluded.is_available;

insert into public.customer_tables (name, seats)
values
  ('Mesa 01', 4),
  ('Mesa 02', 4),
  ('Mesa 03', 2),
  ('Mesa 04', 6)
on conflict (name) do update
set seats = excluded.seats;

update public.profiles
set role = 'owner'
where id in (
  select id
  from public.profiles
  order by created_at asc
  limit 1
);

