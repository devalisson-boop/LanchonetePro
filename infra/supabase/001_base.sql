create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('owner', 'manager', 'cashier', 'attendant', 'kitchen');
  end if;

  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum ('draft', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'order_type') then
    create type public.order_type as enum ('counter', 'delivery', 'pickup', 'table');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('cash', 'pix', 'credit_card', 'debit_card', 'voucher');
  end if;

  if not exists (select 1 from pg_type where typname = 'table_status') then
    create type public.table_status as enum ('available', 'occupied', 'reserved', 'cleaning');
  end if;

  if not exists (select 1 from pg_type where typname = 'stock_movement_type') then
    create type public.stock_movement_type as enum ('in', 'out', 'adjustment');
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.generate_order_reference()
returns text
language plpgsql
as $$
begin
  return 'PED-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
end;
$$;

