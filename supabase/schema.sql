-- ============================================================
-- Phase 3 — Supabase PostgreSQL Schema for QR-ATT
--
-- This file replaces the local SQLite schema with a cloud schema.
-- It mirrors the original `events` and `attendance` tables but
-- integrates with Supabase Auth (auth.users) and adds Row Level
-- Security.
--
-- PHASE 10 BONUS:
-- Teacher History can display attendee names from `profiles`.
-- The attendance.student_id relationship points to
-- public.profiles(id) so Supabase can retrieve attendee profile
-- information.
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard -> SQL Editor
--   2. Paste the ENTIRE file
--   3. Click "Run"
--   4. Verify the tables appear under Table Editor
-- ============================================================


-- ------------------------------------------------------------
-- 1. PROFILES TABLE
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'student'
    check (role in ('student', 'teacher')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;


-- Profiles policies

drop policy if exists "Profiles are viewable by owner"
on public.profiles;

create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);


drop policy if exists "Users can insert their own profile"
on public.profiles;

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);


drop policy if exists "Users can update their own profile"
on public.profiles;

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);


-- Automatically create a profile after a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);

  return new;
end;
$$;


drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ------------------------------------------------------------
-- 2. EVENTS TABLE
-- ------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null unique,
  title text not null,
  start_time timestamptz,
  end_time timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;


-- Events policies

drop policy if exists "Events are readable by any authenticated user"
on public.events;

create policy "Events are readable by any authenticated user"
  on public.events for select
  using (auth.role() = 'authenticated');


drop policy if exists "Users can insert events"
on public.events;

create policy "Users can insert events"
  on public.events for insert
  with check (auth.role() = 'authenticated');


drop policy if exists "Users can update their own events"
on public.events;

create policy "Users can update their own events"
  on public.events for update
  using (auth.uid() = created_by);


-- ------------------------------------------------------------
-- 3. ATTENDANCE TABLE
--
-- Original schema:
--   student_id -> auth.users(id)
--
-- PHASE 10 BONUS:
--   student_id -> profiles(id)
--
-- This allows Supabase to retrieve attendee names through
-- the profiles relationship.
-- ------------------------------------------------------------
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),

  -- PHASE 10 BONUS
  student_id uuid not null
    references public.profiles (id)
    on delete cascade,

  event_id uuid not null
    references public.events (id)
    on delete cascade,

  scanned_at timestamptz not null default now(),

  unique (student_id, event_id)
);

alter table public.attendance enable row level security;


-- ------------------------------------------------------------
-- Attendance policies
-- ------------------------------------------------------------

drop policy if exists "Students can view their own attendance"
on public.attendance;

create policy "Students can view their own attendance"
  on public.attendance for select
  using (auth.uid() = student_id);


drop policy if exists "Students can insert their own attendance"
on public.attendance;

create policy "Students can insert their own attendance"
  on public.attendance for insert
  with check (auth.uid() = student_id);


-- Teachers can view attendance for events they created
drop policy if exists "Teachers can view attendance for their events"
on public.attendance;

create policy "Teachers can view attendance for their events"
  on public.attendance for select
  using (
    exists (
      select 1
      from public.events e
      where e.id = attendance.event_id
        and e.created_by = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- 4. PHASE 10 BONUS — TEACHER ATTENDEE PROFILE ACCESS
--
-- Teachers can read the profiles of students who attended
-- events created by that teacher.
-- ------------------------------------------------------------
drop policy if exists "Teachers can view profiles of their attendees"
on public.profiles;

create policy "Teachers can view profiles of their attendees"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.attendance a
      join public.events e
        on e.id = a.event_id
      where a.student_id = profiles.id
        and e.created_by = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- END OF SCHEMA
-- ------------------------------------------------------------