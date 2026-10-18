drop policy if exists "Teachers can insert events" on public.events;
drop policy if exists "Teachers and admins can insert events" on public.events;

create policy "Teachers and admins can insert events"
  on public.events for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('teacher', 'admin')
    )
  );