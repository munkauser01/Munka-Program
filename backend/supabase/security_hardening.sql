-- Restrict mutable columns, immutable scope, and shared payloads.
revoke update on public.munka_spaces from authenticated;
grant update (name) on public.munka_spaces to authenticated;
revoke update on public.munka_space_members from authenticated;
grant update (role) on public.munka_space_members to authenticated;
revoke update on public.munka_records from authenticated;
grant update (body, schema_version, deleted) on public.munka_records to authenticated;

create index munka_spaces_owner_idx on public.munka_spaces(owner_id);

alter table public.munka_records
add constraint munka_shared_payload_private_keys
check (
  space_id is null
  or not (body ?| array[
    '_sync', 'sourceRef', 'externalCalendar', 'reminder',
    'notifiedFor', 'course', 'dependencies', 'accessToken',
    'refreshToken', 'apiKey', 'password'
  ])
);

create or replace function munka_private.space_revision()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
     or new.kind is distinct from old.kind or new.created_at is distinct from old.created_at then
    raise exception 'Space identity and kind cannot change';
  end if;
  new.updated_at := now();
  return new;
end
$$;
revoke all on function munka_private.space_revision() from public, anon, authenticated;
create trigger munka_space_revision before update on public.munka_spaces
for each row execute function munka_private.space_revision();

create or replace function munka_private.record_revision()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare v_space_kind text;
begin
  if new.space_id is not null then
    select kind into v_space_kind from public.munka_spaces where id = new.space_id;
    if v_space_kind = 'calendar' and new.kind <> 'event' then
      raise exception 'A shared calendar accepts events only';
    elsif v_space_kind = 'project' and new.kind <> 'task' then
      raise exception 'A shared project accepts tasks only';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
       or new.space_id is distinct from old.space_id or new.kind is distinct from old.kind
       or new.created_at is distinct from old.created_at then
      raise exception 'Record identity and scope cannot change';
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
  else
    new.version := 1;
    new.created_at := now();
    new.updated_at := now();
  end if;
  return new;
end
$$;
