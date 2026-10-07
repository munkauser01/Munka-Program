-- Supabase anonymous Auth users also assume the authenticated database role.
-- Munka cloud data requires a permanent email or Google account.
create or replace function munka_private.permanent_account()
returns boolean language sql stable security invoker
set search_path = ''
as $$
  select auth.uid() is not null
     and coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'false'
$$;
revoke all on function munka_private.permanent_account() from public, anon;
grant execute on function munka_private.permanent_account() to authenticated;

create policy munka_spaces_permanent_account on public.munka_spaces
as restrictive for all to authenticated
using (munka_private.permanent_account())
with check (munka_private.permanent_account());
create policy munka_members_permanent_account on public.munka_space_members
as restrictive for all to authenticated
using (munka_private.permanent_account())
with check (munka_private.permanent_account());
create policy munka_records_permanent_account on public.munka_records
as restrictive for all to authenticated
using (munka_private.permanent_account())
with check (munka_private.permanent_account());
create policy munka_history_permanent_account on public.munka_record_history
as restrictive for select to authenticated
using (munka_private.permanent_account());
