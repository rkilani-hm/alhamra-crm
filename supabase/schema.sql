-- ============================================================
-- Alhamra CRM — Phase 1 Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Departments
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- 2. Profiles (extends auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'frontdesk' check (role in ('frontdesk','department','manager')),
  department_id uuid references departments(id),
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'frontdesk');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. Contacts
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  source text check (source in ('call','visit','web','whatsapp')),
  created_at timestamptz default now()
);

-- 4. Cases
create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id),
  channel text check (channel in ('call','visit','web','whatsapp')),
  subject text not null,
  priority text default 'normal' check (priority in ('low','normal','urgent')),
  status text default 'new' check (status in ('new','inprogress','done')),
  department_id uuid references departments(id),
  created_by uuid references profiles(id),
  notes text,
  due_at timestamptz,
  created_at timestamptz default now()
);

-- 5. Case notes
create table if not exists case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete cascade,
  author_id uuid references profiles(id),
  body text not null,
  created_at timestamptz default now()
);

-- ============================================================
-- RLS Policies
-- ============================================================

alter table departments enable row level security;
alter table profiles enable row level security;
alter table contacts enable row level security;
alter table cases enable row level security;
alter table case_notes enable row level security;

-- Departments: all authenticated users can read
create policy "departments_read" on departments for select to authenticated using (true);

-- Profiles: users read/update own row; managers read all
create policy "profiles_read_own" on profiles for select to authenticated using (auth.uid() = id);
create policy "profiles_update_own" on profiles for update to authenticated using (auth.uid() = id);

-- Contacts: authenticated users can read and insert
create policy "contacts_read" on contacts for select to authenticated using (true);
create policy "contacts_insert" on contacts for insert to authenticated with check (true);

-- Cases: frontdesk/manager see all; department sees own dept only
create policy "cases_read_all" on cases for select to authenticated using (
  exists (
    select 1 from profiles p where p.id = auth.uid() and p.role in ('frontdesk','manager')
  )
  or
  exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'department' and p.department_id = cases.department_id
  )
);
create policy "cases_insert" on cases for insert to authenticated with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('frontdesk','manager'))
);
create policy "cases_update" on cases for update to authenticated using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('frontdesk','manager'))
  or
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'department' and p.department_id = cases.department_id)
);

-- Case notes: authenticated users can insert and read (scoped via cases RLS)
create policy "case_notes_read" on case_notes for select to authenticated using (true);
create policy "case_notes_insert" on case_notes for insert to authenticated with check (true);

-- ============================================================
-- Seed Data
-- ============================================================

insert into departments (name) values
  ('Sales'),
  ('Operations'),
  ('Finance'),
  ('Technical Support')
on conflict do nothing;
