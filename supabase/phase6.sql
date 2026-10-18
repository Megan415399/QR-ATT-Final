
create or replace function public.admin_update_attendance_status(
  target_attendance_id uuid,
  new_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be logged in.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Only administrators can correct attendance records.';
  end if;

  if new_status not in ('present', 'late') then
    raise exception 'Invalid attendance status.';
  end if;

  update public.attendance
  set status = new_status
  where id = target_attendance_id;

  if not found then
    raise exception 'Attendance record not found.';
  end if;
end;
$$;

revoke all on function public.admin_update_attendance_status(uuid, text)
from public, anon;

grant execute on function public.admin_update_attendance_status(uuid, text)
to authenticated;
