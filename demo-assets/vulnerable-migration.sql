-- Demo asset: paste this into the "Paste SQL" input during the live demo.
-- Looks like a normal vibe-coded Supabase migration; contains 3 hidden critical issues.

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  date_of_birth date,
  diagnosis text,
  owner_id uuid references auth.users (id) not null,
  created_at timestamptz default now()
);

-- Issue 1 (CRITICAL): RLS enabled but the policy is USING (true) —
-- every authenticated AND anonymous user can read every patient row.
alter table public.patients enable row level security;

create policy "patients_read" on public.patients
  for select
  using (true);

create policy "patients_owner_write" on public.patients
  for insert
  with check (auth.uid() = owner_id);

create table public.invoices (
  id bigint generated always as identity primary key,
  patient_id uuid references public.patients (id),
  amount_cents integer not null,
  status text default 'draft'
);

-- Issue 2 (CRITICAL): RLS never enabled on invoices — no policy protects it at all.
grant select on public.invoices to anon, authenticated;

-- Issue 3 (HIGH): SECURITY DEFINER function bypasses RLS and is executable by anon.
create or replace function public.get_patient_report(p_id uuid)
returns table (full_name text, diagnosis text)
language sql
security definer
as $$
  select full_name, diagnosis from public.patients where id = p_id;
$$;

grant execute on function public.get_patient_report(uuid) to anon;
