-- Additive sync/sharing API. Public wrappers are invokers; privileged work stays private.
create table public.munka_planners (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version = 1),
  revision bigint not null default 1 check (revision > 0),
  body jsonb not null check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 4000000),
  updated_at timestamptz not null default now()
);
alter table public.munka_planners enable row level security;
revoke all on public.munka_planners from public, anon, authenticated;
grant select on public.munka_planners to authenticated;
create policy munka_planner_read on public.munka_planners for select to authenticated
using (owner_id = (select auth.uid()) and munka_private.permanent_account());

alter table public.munka_spaces add column settings jsonb not null default '{}';
alter table public.munka_space_members add column permissions jsonb not null default '{"create":true,"edit":true,"delete":false}';
alter table public.munka_space_members add column email text;
create table public.munka_invitations (
  id uuid primary key default gen_random_uuid(),
  space_id text not null references public.munka_spaces(id) on delete cascade,
  email text not null check (length(email) between 3 and 254),
  role text not null check (role in ('editor','viewer')),
  permissions jsonb not null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  accepted_by uuid references auth.users(id)
);
create index munka_invites_recipient on public.munka_invitations(email, status, expires_at);
create index munka_invites_space on public.munka_invitations(space_id);
alter table public.munka_invitations enable row level security;
revoke all on public.munka_invitations from public, anon, authenticated;
grant select on public.munka_invitations to authenticated;
create policy munka_invites_owner_read on public.munka_invitations for select to authenticated
using (munka_private.permanent_account() and munka_private.space_role(space_id) = 'owner');
-- Writes must pass the atomic API; direct calls cannot bypass revisions/permissions.
revoke insert, update on public.munka_records from authenticated;
revoke update (body, schema_version, deleted) on public.munka_records from authenticated;
revoke insert, update, delete on public.munka_space_members from authenticated;
revoke update (role) on public.munka_space_members from authenticated;
revoke insert, update on public.munka_spaces from authenticated;
revoke update (name) on public.munka_spaces from authenticated;

create function munka_private.permissions(p_role text, p_flags jsonb)
returns jsonb language sql immutable security invoker set search_path = '' as $$
 select jsonb_build_object('create', p_role = 'editor' and coalesce(p_flags->'create' = 'true'::jsonb,false),
 'edit', p_role = 'editor' and coalesce(p_flags->'edit' = 'true'::jsonb,false),
 'delete', p_role = 'editor' and coalesce(p_flags->'delete' = 'true'::jsonb,false))
$$;
revoke all on function munka_private.permissions(text,jsonb) from public,anon,authenticated;

create function munka_private.cloud(p_action text, p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
<<cloud_api>>
declare
 u uuid := auth.uid(); mail text; s public.munka_spaces; r public.munka_records;
 invitation public.munka_invitations; planner public.munka_planners;
 role_name text; flags jsonb; result jsonb; body jsonb; target text; expected bigint;
begin
 if u is null or not munka_private.permanent_account() then raise exception 'Sign in to use cloud calendars' using errcode='42501'; end if;
 select lower(btrim(email)) into mail from auth.users where id=u and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if mail is null then raise exception 'A confirmed account is required' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text)>4200000 then raise exception 'Invalid cloud request'; end if;

 if p_action='planner_read' then
   select * into planner from public.munka_planners where owner_id=u;
   return case when planner.owner_id is null then jsonb_build_object('revision',0,'body',null) else to_jsonb(planner)-'owner_id' end;
 elsif p_action='planner_write' then
   body:=p_data->'body'; expected:=(p_data->>'revision')::bigint;
   if body is null or jsonb_typeof(body)<>'object' or body->>'version'<>'1' or octet_length(body::text)>4000000 then raise exception 'Invalid planner'; end if;
   perform pg_advisory_xact_lock(hashtextextended(u::text,0));
   select * into planner from public.munka_planners where owner_id=u for update;
   if expected is null or expected <> coalesce(planner.revision,0) then raise exception 'Cloud planner changed; merge before saving' using errcode='40001'; end if;
   insert into public.munka_planners(owner_id,body) values(u,body)
   on conflict(owner_id) do update set body=excluded.body, revision=munka_planners.revision+1,updated_at=now()
   returning * into planner;
   return to_jsonb(planner)-'owner_id';
 elsif p_action='calendar_list' then
   if (select count(*) from public.munka_spaces x where x.kind='calendar' and (x.owner_id=u or exists(select 1 from public.munka_space_members m where m.space_id=x.id and m.user_id=u)))>100 then raise exception 'Calendar limit reached'; end if;
   select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('role',case when x.owner_id=u then 'owner' else m.role end,'permissions',case when x.owner_id=u then '{"create":true,"edit":true,"delete":true}'::jsonb else munka_private.permissions(m.role,m.permissions) end)), '[]') into result
   from public.munka_spaces x left join public.munka_space_members m on m.space_id=x.id and m.user_id=u
   where x.kind='calendar' and (x.owner_id=u or m.user_id=u);
   if (select count(*) from public.munka_records e where not e.deleted and e.space_id in(select x->>'id' from jsonb_array_elements(result)x))>10000 then raise exception 'Shared event limit reached'; end if;
   if (select coalesce(sum(octet_length(e.body::text)),0) from public.munka_records e where not e.deleted and e.space_id in(select x->>'id' from jsonb_array_elements(result)x))>1000000 then raise exception 'Shared calendar data exceeds this beta limit; archive older events'; end if;
   return jsonb_build_object('calendars',result,'events',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from public.munka_records e where not e.deleted and e.space_id in(select x->>'id' from jsonb_array_elements(result)x)));
 elsif p_action='invitation_list' then
   return (select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('calendar_name',x.name)),'[]') from public.munka_invitations i join public.munka_spaces x on x.id=i.space_id where i.email=mail and i.status='pending' and i.expires_at>now());
 elsif p_action='calendar_create' then
   if (select count(*) from public.munka_spaces where owner_id=u and kind='calendar')>=50 then raise exception 'Calendar limit reached'; end if;
   if length(btrim(p_data->>'name')) not between 1 and 200 or p_data->>'name' is null then raise exception 'Name your calendar'; end if;
   insert into public.munka_spaces(id,owner_id,kind,name,settings) values(gen_random_uuid()::text,u,'calendar',btrim(p_data->>'name'),jsonb_build_object('color',coalesce(p_data->>'color','sage'))) returning * into s;
   return to_jsonb(s);
 elsif p_action='invitation_accept' then
   -- Lock calendar before invitation, matching owner revoke/permission transactions.
   select x.* into s from public.munka_spaces x join public.munka_invitations i on i.space_id=x.id where i.id=(p_data->>'id')::uuid for update of x;
   select * into invitation from public.munka_invitations where id=(p_data->>'id')::uuid for update;
   if invitation.id is null or invitation.email<>mail or invitation.status<>'pending' or invitation.expires_at<=now() then raise exception 'Invitation is expired, revoked or belongs to another email' using errcode='42501'; end if;
   if s.owner_id=u then raise exception 'You already own this calendar'; end if;
   insert into public.munka_space_members(space_id,user_id,role,permissions,email) values(invitation.space_id,u,invitation.role,invitation.permissions,mail)
   on conflict(space_id,user_id) do nothing;
   update public.munka_invitations set status='accepted',accepted_by=u where id=invitation.id;
   return jsonb_build_object('accepted',true);
 end if;

 target:=p_data->>'calendar';
 select * into s from public.munka_spaces where id=target and kind='calendar' for update;
 if s.id is null then raise exception 'Calendar unavailable' using errcode='42501'; end if;
 role_name:=munka_private.space_role(target);
 if role_name is null then raise exception 'Calendar unavailable' using errcode='42501'; end if;
 select munka_private.permissions(m.role,m.permissions) into flags from public.munka_space_members m where m.space_id=target and m.user_id=u;
 if role_name='owner' then flags:='{"create":true,"edit":true,"delete":true}'; end if;

 if p_action='event_write' then
   body:=p_data->'body'; expected:=(p_data->>'version')::bigint;
   if p_data->>'id' is null or p_data->>'id' !~ '^[a-zA-Z0-9_-]{1,100}$' or jsonb_typeof(body)<>'object' then raise exception 'Invalid event'; end if;
   select * into r from public.munka_records where id=p_data->>'id' for update;
   if r.id is not null and r.space_id is distinct from target then raise exception 'Event belongs to another calendar' using errcode='42501'; end if;
   if expected is null or expected<>coalesce(r.version,0) then raise exception 'This event changed; refresh before saving' using errcode='40001'; end if;
   if not coalesce((flags->>case when r.id is null then 'create' when p_data->'deleted'='true'::jsonb then 'delete' else 'edit' end)::boolean,false) then raise exception 'Your calendar permissions do not allow this change' using errcode='42501'; end if;
   if r.id is null and p_data->'deleted'='true'::jsonb then raise exception 'Event unavailable'; end if;
   if exists(select 1 from jsonb_object_keys(body)k where k not in('id','title','start','end','allDay','notes','location','color','kind','source','deadlineDate')) then raise exception 'Shared events cannot contain private planner fields'; end if;
   if jsonb_typeof(body->'title') is distinct from 'string' or jsonb_typeof(body->'start') is distinct from 'string' or jsonb_typeof(body->'end') is distinct from 'string'
      or (body ? 'allDay' and jsonb_typeof(body->'allDay')<>'boolean')
      or (body ? 'notes' and (jsonb_typeof(body->'notes')<>'string' or length(body->>'notes')>10000))
      or (body ? 'location' and (jsonb_typeof(body->'location')<>'string' or length(body->>'location')>2000))
      or (body ? 'source' and body->>'source' not in('munka','deadline')) then raise exception 'Invalid shared event details'; end if;
   if body->>'id' is distinct from p_data->>'id' or length(btrim(body->>'title')) not between 1 and 500 or body->>'title' is null or body->>'start' is null or body->>'end' is null or (body->>'end')::timestamp < (body->>'start')::timestamp then raise exception 'Check event title and dates'; end if;
   if octet_length(body::text)>200000 then raise exception 'Event too large'; end if;
   if r.id is null then
     insert into public.munka_records(id,owner_id,space_id,kind,body) values(p_data->>'id',u,target,'event',body) returning * into r;
   else
     update public.munka_records set body=cloud_api.body,deleted=coalesce(p_data->'deleted'='true'::jsonb,false) where id=r.id returning * into r;
   end if;
   return to_jsonb(r);
 elsif p_action='calendar_leave' and role_name<>'owner' then
   delete from public.munka_space_members where space_id=target and user_id=u; return jsonb_build_object('left',true);
 end if;
 if role_name<>'owner' then raise exception 'Only the owner can manage calendar access' using errcode='42501'; end if;
 if p_action='calendar_members' then
   return jsonb_build_object('members',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.munka_space_members m where space_id=target),
     'invitations',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from public.munka_invitations i where space_id=target and status='pending' and expires_at>now()));
 elsif p_action='calendar_invite' then
   if lower(btrim(p_data->>'email')) is null or lower(btrim(p_data->>'email')) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(p_data->>'email')>254 then raise exception 'Enter a valid email'; end if;
   if p_data->>'role' not in('editor','viewer') or p_data->>'role' is null then raise exception 'Choose Viewer or Editor'; end if;
   if lower(btrim(p_data->>'email'))=mail then raise exception 'You already own this calendar'; end if;
   if (select count(*) from public.munka_invitations where space_id=target and status='pending' and expires_at>now())>=100 then raise exception 'Invitation limit reached'; end if;
   update public.munka_invitations set status='revoked' where space_id=target and email=lower(btrim(p_data->>'email')) and status='pending';
   insert into public.munka_invitations(space_id,email,role,permissions,created_by) values(target,lower(btrim(p_data->>'email')),p_data->>'role',munka_private.permissions(p_data->>'role',p_data->'permissions'),u) returning * into invitation;
   return to_jsonb(invitation);
 elsif p_action='calendar_access' then
   if p_data->>'role' not in('editor','viewer') or p_data->>'role' is null then raise exception 'Choose Viewer or Editor'; end if;
   update public.munka_space_members set role=p_data->>'role',permissions=munka_private.permissions(p_data->>'role',p_data->'permissions') where space_id=target and user_id=(p_data->>'user')::uuid;
   if not found then raise exception 'Member unavailable'; end if;
   return jsonb_build_object('updated',true);
 elsif p_action='calendar_revoke' then
   delete from public.munka_space_members where space_id=target and user_id=(p_data->>'user')::uuid;
   update public.munka_invitations set status='revoked' where space_id=target and email=(select lower(btrim(email)) from auth.users where id=(p_data->>'user')::uuid) and status='pending';
   return jsonb_build_object('revoked',true);
 elsif p_action='invitation_revoke' then
   update public.munka_invitations set status='revoked' where space_id=target and id=(p_data->>'id')::uuid and status='pending'; return jsonb_build_object('revoked',true);
 elsif p_action='calendar_update' then
   if length(btrim(p_data->>'name')) not between 1 and 200 or p_data->>'name' is null then raise exception 'Name your calendar'; end if;
   update public.munka_spaces set name=btrim(p_data->>'name'),settings=jsonb_build_object('color',coalesce(p_data->>'color','sage')) where id=target returning * into s;
   return to_jsonb(s);
 end if;
 raise exception 'Unknown cloud action';
end $$;
revoke all on function munka_private.cloud(text,jsonb) from public,anon;
grant execute on function munka_private.cloud(text,jsonb) to authenticated;
create function public.munka_cloud(p_action text, p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path = '' as $$ select munka_private.cloud(p_action,p_data) $$;
revoke all on function public.munka_cloud(text,jsonb) from public,anon;
grant execute on function public.munka_cloud(text,jsonb) to authenticated;
