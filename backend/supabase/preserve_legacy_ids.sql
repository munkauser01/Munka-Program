-- The foundation tables are empty. Refuse to rebuild if any data has arrived.
do $$ begin
  if exists (select 1 from public.munka_spaces)
     or exists (select 1 from public.munka_space_members)
     or exists (select 1 from public.munka_records)
     or exists (select 1 from public.munka_record_history) then
    raise exception 'Munka foundation has data; preserve it and use a data migration';
  end if;
end $$;
drop table public.munka_record_history;
drop table public.munka_records;
drop table public.munka_space_members;
drop table public.munka_spaces;
drop function munka_private.record_revision();
drop function munka_private.record_history();
drop function munka_private.space_role(uuid);

-- Munka Supabase foundation. Applied as migration munka_backend_foundation.
-- Planner IDs are text so imported backups keep their existing IDs.
create schema if not exists munka_private;
revoke all on schema munka_private from public;
grant usage on schema munka_private to authenticated;

create table public.munka_spaces (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('project', 'calendar')),
  name text not null check (length(name) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.munka_space_members (
  space_id text not null references public.munka_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index munka_space_members_user_idx on public.munka_space_members(user_id);

create or replace function munka_private.space_role(p_space_id text)
returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when s.owner_id = (select auth.uid()) then 'owner'
    else (select m.role from public.munka_space_members m
          where m.space_id = s.id and m.user_id = (select auth.uid()))
  end
  from public.munka_spaces s
  where s.id = p_space_id
$$;
revoke all on function munka_private.space_role(text) from public, anon;
grant execute on function munka_private.space_role(text) to authenticated;

create table public.munka_records (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  space_id text references public.munka_spaces(id) on delete restrict,
  kind text not null check (kind in ('task', 'course', 'term', 'project', 'event', 'habit')),
  schema_version integer not null default 1 check (schema_version > 0),
  version bigint not null default 1 check (version > 0),
  body jsonb not null check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 200000),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index munka_records_owner_idx on public.munka_records(owner_id, kind);
create index munka_records_space_idx on public.munka_records(space_id, kind) where space_id is not null;

create table public.munka_record_history (
  id bigint generated always as identity primary key,
  record_id text not null references public.munka_records(id) on delete cascade,
  version bigint not null,
  body jsonb not null,
  deleted boolean not null,
  actor_id uuid,
  recorded_at timestamptz not null default now(),
  unique (record_id, version)
);
create index munka_record_history_record_idx on public.munka_record_history(record_id, version desc);

create or replace function munka_private.record_revision()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
       or new.space_id is distinct from old.space_id or new.kind is distinct from old.kind
       or new.created_at is distinct from old.created_at then
      raise exception 'Record identity and scope cannot change';
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end
$$;
revoke all on function munka_private.record_revision() from public, anon, authenticated;
create trigger munka_record_revision before update on public.munka_records
for each row execute function munka_private.record_revision();

create or replace function munka_private.record_history()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.munka_record_history(record_id, version, body, deleted, actor_id)
  values (new.id, new.version, new.body, new.deleted, auth.uid());
  return new;
end
$$;
revoke all on function munka_private.record_history() from public, anon, authenticated;
create trigger munka_record_history after insert or update on public.munka_records
for each row execute function munka_private.record_history();

alter table public.munka_spaces enable row level security;
alter table public.munka_space_members enable row level security;
alter table public.munka_records enable row level security;
alter table public.munka_record_history enable row level security;

revoke all on public.munka_spaces, public.munka_space_members, public.munka_records, public.munka_record_history from anon, authenticated;
grant select, insert, update on public.munka_spaces to authenticated;
grant select, insert, update, delete on public.munka_space_members to authenticated;
grant select, insert, update on public.munka_records to authenticated;
grant select on public.munka_record_history to authenticated;

create policy munka_spaces_read on public.munka_spaces for select to authenticated
using (munka_private.space_role(id) is not null);
create policy munka_spaces_insert on public.munka_spaces for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy munka_spaces_update on public.munka_spaces for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy munka_members_read on public.munka_space_members for select to authenticated
using (user_id = (select auth.uid()) or munka_private.space_role(space_id) = 'owner');
create policy munka_members_insert on public.munka_space_members for insert to authenticated
with check (munka_private.space_role(space_id) = 'owner' and user_id <> (select auth.uid()));
create policy munka_members_update on public.munka_space_members for update to authenticated
using (munka_private.space_role(space_id) = 'owner')
with check (munka_private.space_role(space_id) = 'owner' and user_id <> (select auth.uid()));
create policy munka_members_delete on public.munka_space_members for delete to authenticated
using (munka_private.space_role(space_id) = 'owner' or user_id = (select auth.uid()));

create policy munka_records_read on public.munka_records for select to authenticated
using (
  (space_id is null and owner_id = (select auth.uid()))
  or (space_id is not null and munka_private.space_role(space_id) is not null)
);
create policy munka_records_insert on public.munka_records for insert to authenticated
with check (
  owner_id = (select auth.uid()) and
  (space_id is null or munka_private.space_role(space_id) in ('owner', 'editor'))
);
create policy munka_records_update on public.munka_records for update to authenticated
using (
  (space_id is null and owner_id = (select auth.uid()))
  or (space_id is not null and munka_private.space_role(space_id) in ('owner', 'editor'))
)
with check (
  (space_id is null and owner_id = (select auth.uid()))
  or (space_id is not null and munka_private.space_role(space_id) in ('owner', 'editor'))
);
create policy munka_history_read on public.munka_record_history for select to authenticated
using (exists (select 1 from public.munka_records r where r.id = record_id));
