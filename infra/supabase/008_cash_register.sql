do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('pending', 'partial', 'paid', 'refunded', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'cash_session_status') then
    create type public.cash_session_status as enum ('open', 'closed');
  end if;

  if not exists (select 1 from pg_type where typname = 'cash_transaction_type') then
    create type public.cash_transaction_type as enum ('opening_float', 'sale', 'refund', 'cash_in', 'cash_out');
  end if;

  if not exists (select 1 from pg_type where typname = 'cash_transaction_status') then
    create type public.cash_transaction_status as enum ('confirmed', 'cancelled');
  end if;
end $$;

create or replace function public.generate_cash_session_reference()
returns text
language plpgsql
as $$
begin
  return 'CX-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
end;
$$;

create or replace function public.generate_cash_transaction_reference()
returns text
language plpgsql
as $$
begin
  return 'MOV-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
end;
$$;

alter table public.orders
  add column if not exists payment_status public.payment_status not null default 'pending',
  add column if not exists paid_amount numeric(12, 2) not null default 0,
  add column if not exists paid_at timestamptz;

update public.orders
set
  payment_status = 'cancelled',
  paid_amount = 0
where status = 'cancelled';

update public.orders
set
  payment_status = 'paid',
  paid_amount = total_amount,
  paid_at = coalesce(paid_at, delivered_at, updated_at)
where status = 'delivered';

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique default public.generate_cash_session_reference(),
  status public.cash_session_status not null default 'open',
  opening_amount numeric(12, 2) not null default 0,
  expected_amount numeric(12, 2) not null default 0,
  counted_amount numeric(12, 2),
  difference_amount numeric(12, 2),
  notes text,
  opened_by uuid references public.profiles (id) on delete set null,
  closed_by uuid references public.profiles (id) on delete set null,
  opened_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_cash_sessions_single_open
  on public.cash_sessions (status)
  where status = 'open';

create index if not exists idx_cash_sessions_opened_at
  on public.cash_sessions (opened_at desc);

create table if not exists public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique default public.generate_cash_transaction_reference(),
  session_id uuid not null references public.cash_sessions (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  transaction_type public.cash_transaction_type not null,
  status public.cash_transaction_status not null default 'confirmed',
  payment_method public.payment_method not null default 'cash',
  amount numeric(12, 2) not null,
  description text,
  processed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint cash_transactions_amount_positive check (amount > 0)
);

create index if not exists idx_cash_transactions_session_created_at
  on public.cash_transactions (session_id, created_at desc);

create index if not exists idx_cash_transactions_order_id
  on public.cash_transactions (order_id);

create index if not exists idx_cash_transactions_payment_method
  on public.cash_transactions (payment_method);

drop trigger if exists trg_cash_sessions_updated_at on public.cash_sessions;
drop trigger if exists trg_cash_transactions_updated_at on public.cash_transactions;

create trigger trg_cash_sessions_updated_at
  before update on public.cash_sessions
  for each row execute procedure public.set_updated_at();

create trigger trg_cash_transactions_updated_at
  before update on public.cash_transactions
  for each row execute procedure public.set_updated_at();
