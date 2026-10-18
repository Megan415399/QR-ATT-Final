-- ============================================================
-- PHASE 2: venue, description, late status, admin role
-- Run AFTER security_fix.sql
-- ============================================================

-- 1. EVENT FIELDS
alter table public.events add column if not exists venue text;
alter table public.events add column if not exists description text;

-- 2. ATTENDANCE STATUS (present / late)
alter table public.attendance
  add column if not exists status text not null default 'present'
  check (status in ('present', 'late'));

-- 3. ADMIN ROLE
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('student', 'teacher', 'admin'));

-- 4. HELPER: is current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- 5. Admin can change roles (students/teachers still cannot)
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Role cannot be changed from the app.';
  end if;
  return new;
end;
$$;

-- 6. ADMIN POLICIES
drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles" on public.profiles
  for select using (public.is_admin());

drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles" on public.profiles
  for update using (public.is_admin());

drop policy if exists "Admins can view all events" on public.events;
create policy "Admins can view all events" on public.events
  for select using (public.is_admin());

drop policy if exists "Admins can update all events" on public.events;
create policy "Admins can update all events" on public.events
  for update using (public.is_admin());

drop policy if exists "Admins can view all attendance" on public.attendance;
create policy "Admins can view all attendance" on public.attendance
  for select using (public.is_admin());

drop policy if exists "Admins can update attendance" on public.attendance;
create policy "Admins can update attendance" on public.attendance
  for update using (public.is_admin());

drop policy if exists "Admins can delete attendance" on public.attendance;
create policy "Admins can delete attendance" on public.attendance
  for delete using (public.is_admin());

-- 7. REGISTER ATTENDANCE: now marks late after 15 minutes
create or replace function public.register_attendance(p_event_code text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_status text := 'present';
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'unauthorized',
      'message', 'Please log in first.');
  end if;

  if not exists (select 1 from public.profiles where id = v_uid and role = 'student') then
    return jsonb_build_object('success', false, 'code', 'unauthorized',
      'message', 'Only students can record attendance.');
  end if;

  select * into v_event from public.events where event_code = p_event_code;
  if not found then
    return jsonb_build_object('success', false, 'code', 'invalid_qr',
      'message', 'Invalid QR code.');
  end if;

  if v_event.status <> 'open' then
    return jsonb_build_object('success', false, 'code', 'closed',
      'message', 'This event is closed.', 'eventTitle', v_event.title);
  end if;

  if v_event.start_time is not null and now() < v_event.start_time then
    return jsonb_build_object('success', false, 'code', 'not_started',
      'message', 'Event has not started yet.', 'eventTitle', v_event.title);
  end if;

  if v_event.end_time is not null and now() > v_event.end_time then
    return jsonb_build_object('success', false, 'code', 'ended',
      'message', 'Event has already ended.', 'eventTitle', v_event.title);
  end if;

  if v_event.start_time is not null and now() > v_event.start_time + interval '15 minutes' then
    v_status := 'late';
  end if;

  begin
    insert into public.attendance (student_id, event_id, status)
    values (v_uid, v_event.id, v_status);
  exception when unique_violation then
    return jsonb_build_object('success', false, 'code', 'duplicate',
      'message', 'Already registered for this event.', 'eventTitle', v_event.title);
  end;

  return jsonb_build_object('success', true, 'code', 'ok',
    'message', case when v_status = 'late' then 'Recorded as LATE.' else 'Attendance recorded!' end,
    'status', v_status,
    'eventTitle', v_event.title);
end;
$$;

revoke all on function public.register_attendance(text) from public;
grant execute on function public.register_attendance(text) to authenticated;