alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists auth_provider text not null default 'email',
  add column if not exists last_sign_in_at timestamptz,
  add column if not exists last_seen_at timestamptz;

update public.profiles
set
  auth_provider = coalesce(auth_provider, 'email'),
  last_seen_at = coalesce(last_seen_at, updated_at, created_at)
where auth_provider is null
   or last_seen_at is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    avatar_url,
    auth_provider,
    role,
    last_seen_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.raw_app_meta_data ->> 'provider', 'email'),
    case
      when not exists (select 1 from public.profiles) then 'owner'::public.user_role
      else 'attendant'::public.user_role
    end,
    timezone('utc', now())
  )
  on conflict (id)
  do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    phone = coalesce(public.profiles.phone, excluded.phone),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    auth_provider = coalesce(excluded.auth_provider, public.profiles.auth_provider),
    last_seen_at = timezone('utc', now());

  return new;
end;
$$;
