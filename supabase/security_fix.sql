-- ============================================================
-- SECURITY + VALIDATION FIX
-- Run AFTER schema.sql
-- ============================================================

-- 1. EVENT STATUS (open / closed)
alter table public.events
  add column if not exists status text not null default 'open'
  check (status in ('open', 'closed'));


-- 2. PREVENT STUDENTS FROM CHANGING THEIR OWN ROLE
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- auth.uid() is null in the SQL Editor (admin), so manual promotion still works
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception 'Role cannot be changed from the app.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute procedure public.prevent_role_change();


-- 3. ONLY TEACHERS CAN CREATE EVENTS
drop policy if exists "Users can insert events" on public.events;
create policy "Teachers can insert events"
  on public.events for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'teacher'
    )
  );


-- 4. STUDENTS CANNOT INSERT ATTENDANCE DIRECTLY
--    (they must go through register_attendance below)
drop policy if exists "Students can insert their own attendance" on public.attendance;


-- 5. SERVER-SIDE ATTENDANCE VALIDATION
create or replace function public.register_attendance(p_event_code text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events%rowtype;
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

  begin
    insert into public.attendance (student_id, event_id)
    values (v_uid, v_event.id);
  exception when unique_violation then
    return jsonb_build_object('success', false, 'code', 'duplicate',
      'message', 'Already registered for this event.', 'eventTitle', v_event.title);
  end;

  return jsonb_build_object('success', true, 'code', 'ok',
    'message', 'Attendance recorded!', 'eventTitle', v_event.title);
end;
$$;

revoke all on function public.register_attendance(text) from public;
grant execute on function public.register_attendance(text) to authenticated;