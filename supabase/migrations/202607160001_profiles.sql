create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role text not null default 'student',
  birth_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('student', 'teacher', 'tutor', 'mentor', 'admin'))
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.prevent_profile_identity_changes()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id
    or new.email is distinct from old.email
    or new.role is distinct from old.role
  then
    raise exception 'Profile identity fields cannot be changed through this client.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_identity_changes on public.profiles;
create trigger profiles_prevent_identity_changes
before update on public.profiles
for each row
execute function public.prevent_profile_identity_changes();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    email,
    role,
    birth_date
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    'student',
    nullif(new.raw_user_meta_data ->> 'birth_date', '')::date
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    birth_date = excluded.birth_date;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
