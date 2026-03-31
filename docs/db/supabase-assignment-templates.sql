create table if not exists public.assignment_templates (
  id text primary key,
  owner_id uuid references auth.users(id) on delete set null,
  title text not null,
  subject text not null,
  timer_minutes integer default 0,
  questions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.assignment_templates enable row level security;

create policy "owners can read templates"
on public.assignment_templates
for select
using (auth.uid() = owner_id or owner_id is null);

create policy "owners can insert templates"
on public.assignment_templates
for insert
with check (auth.uid() = owner_id or owner_id is null);

create policy "owners can update templates"
on public.assignment_templates
for update
using (auth.uid() = owner_id or owner_id is null)
with check (auth.uid() = owner_id or owner_id is null);
