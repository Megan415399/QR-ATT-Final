
create or replace function public.admin_update_user_role(
  target_user_id uuid,
  new_role text
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
    raise exception 'Only administrators can change user roles.';
  end if;

  if new_role not in ('student', 'teacher', 'admin') then
    raise exception 'Invalid user role.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot change your own role.';
  end if;

  update public.profiles
  set role = new_role
  where id = target_user_id;

  if not found then
    raise exception 'User profile not found.';
  end if;
end;
$$;

revoke all on function public.admin_update_user_role(uuid, text)
from public, anon;

grant execute on function public.admin_update_user_role(uuid, text)
to authenticated;
