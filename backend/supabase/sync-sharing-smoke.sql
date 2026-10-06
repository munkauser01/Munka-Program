-- Synthetic verified users, transactional rollback; no production planner/account changes.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('e1111111-1111-4111-8111-111111111111','sync-owner@test.invalid',now()),
 ('e2222222-2222-4222-8222-222222222222','sync-editor@test.invalid',now()),
 ('e3333333-3333-4333-8333-333333333333','sync-viewer@test.invalid',now()),
 ('e4444444-4444-4444-8444-444444444444','sync-stranger@test.invalid',now());
set local role authenticated;
do $$
declare cal text; inv jsonb; event jsonb; changed jsonb; failed boolean; initial jsonb;
begin
 perform set_config('request.jwt.claims','{"sub":"e1111111-1111-4111-8111-111111111111","is_anonymous":false}',true);
 initial:=public.munka_cloud('planner_write','{"revision":0,"body":{"version":1,"tasks":[]}}');
 if initial->>'revision'<>'1' then raise exception 'initial planner revision'; end if;
 failed:=false; begin perform public.munka_cloud('planner_write','{"revision":0,"body":{"version":1}}'); exception when serialization_failure then failed:=true; end;
 if not failed then raise exception 'stale planner write allowed'; end if;
 cal:=public.munka_cloud('calendar_create','{"name":"Shared test"}')->>'id';
 inv:=public.munka_cloud('calendar_invite',jsonb_build_object('calendar',cal,'email','SYNC-EDITOR@test.invalid','role','editor','permissions','{"create":true,"edit":true,"delete":false}'::jsonb));
 perform set_config('request.jwt.claims','{"sub":"e4444444-4444-4444-8444-444444444444","is_anonymous":false}',true);
 failed:=false; begin perform public.munka_cloud('invitation_accept',jsonb_build_object('id',inv->>'id')); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'wrong email accepted invitation'; end if;
 if (public.munka_cloud('planner_read')->>'revision')<>'0' then raise exception 'private planner isolation'; end if;
 if (select count(*) from public.munka_planners)<>0 then raise exception 'direct planner RLS'; end if;
 perform set_config('request.jwt.claims','{"sub":"e2222222-2222-4222-8222-222222222222","is_anonymous":false}',true);
 if jsonb_array_length(public.munka_cloud('invitation_list'))<>1 then raise exception 'invite inbox'; end if;
 perform public.munka_cloud('invitation_accept',jsonb_build_object('id',inv->>'id'));
 failed:=false; begin perform public.munka_cloud('invitation_accept',jsonb_build_object('id',inv->>'id')); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'invite replay'; end if;
 event:=jsonb_build_object('id','sync-test-event','title','Test event','start','2026-10-05T10:00','end','2026-10-05T11:00','allDay',false);
 changed:=public.munka_cloud('event_write',jsonb_build_object('calendar',cal,'id','sync-test-event','version',0,'body',event));
 if changed->>'version'<>'1' then raise exception 'event create version'; end if;
 event:=event||'{"title":"Edited"}';
 changed:=public.munka_cloud('event_write',jsonb_build_object('calendar',cal,'id','sync-test-event','version',1,'body',event));
 if changed->>'version'<>'2' then raise exception 'event edit version'; end if;
 failed:=false; begin perform public.munka_cloud('event_write',jsonb_build_object('calendar',cal,'id','sync-test-event','version',1,'body',event)); exception when serialization_failure then failed:=true; end;
 if not failed then raise exception 'stale event write allowed'; end if;
 failed:=false; begin perform public.munka_cloud('event_write',jsonb_build_object('calendar',cal,'id','sync-test-event','version',2,'body',event,'deleted',true)); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'editor deleted without permission'; end if;
 failed:=false; begin perform public.munka_cloud('calendar_invite',jsonb_build_object('calendar',cal,'email','sync-stranger@test.invalid','role','viewer')); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'editor invited member'; end if;
 failed:=false; begin update public.munka_records set body='{}' where id='sync-test-event'; exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'direct write bypass'; end if;
 perform set_config('request.jwt.claims','{"sub":"e1111111-1111-4111-8111-111111111111","is_anonymous":false}',true);
 inv:=public.munka_cloud('calendar_invite',jsonb_build_object('calendar',cal,'email','sync-viewer@test.invalid','role','viewer','permissions','{"create":true,"edit":true,"delete":true}'::jsonb));
 perform set_config('request.jwt.claims','{"sub":"e3333333-3333-4333-8333-333333333333","is_anonymous":false}',true);
 perform public.munka_cloud('invitation_accept',jsonb_build_object('id',inv->>'id'));
 if jsonb_array_length(public.munka_cloud('calendar_list')->'events')<>1 then raise exception 'viewer cannot display events'; end if;
 if public.munka_cloud('calendar_list')->'calendars'->0->'permissions'->>'edit'<>'false' then raise exception 'viewer permissions elevated'; end if;
 failed:=false; begin perform public.munka_cloud('event_write',jsonb_build_object('calendar',cal,'id','sync-test-event','version',2,'body',event)); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'viewer edited event'; end if;
 perform set_config('request.jwt.claims','{"sub":"e1111111-1111-4111-8111-111111111111","is_anonymous":false}',true);
 perform public.munka_cloud('calendar_access',jsonb_build_object('calendar',cal,'user','e2222222-2222-4222-8222-222222222222','role','editor','permissions','{"create":false,"edit":true,"delete":true}'::jsonb));
 perform set_config('request.jwt.claims','{"sub":"e2222222-2222-4222-8222-222222222222","is_anonymous":false}',true);
 failed:=false; begin perform public.munka_cloud('event_write',jsonb_build_object('calendar',cal,'id','sync-test-second','version',0,'body',event||'{"id":"sync-test-second"}')); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'custom create permission ignored'; end if;
 perform public.munka_cloud('event_write',jsonb_build_object('calendar',cal,'id','sync-test-event','version',2,'body',event,'deleted',true));
 perform set_config('request.jwt.claims','{"sub":"e1111111-1111-4111-8111-111111111111","is_anonymous":false}',true);
 perform public.munka_cloud('calendar_revoke',jsonb_build_object('calendar',cal,'user','e2222222-2222-4222-8222-222222222222'));
 perform set_config('request.jwt.claims','{"sub":"e2222222-2222-4222-8222-222222222222","is_anonymous":false}',true);
 if jsonb_array_length(public.munka_cloud('calendar_list')->'calendars')<>0 then raise exception 'revoked calendar still visible'; end if;
 failed:=false; begin perform public.munka_cloud('event_write',jsonb_build_object('calendar',cal,'id','sync-test-event','version',3,'body',event)); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'revoked member wrote'; end if;
 perform set_config('request.jwt.claims','{"sub":"e1111111-1111-4111-8111-111111111111","is_anonymous":true}',true);
 failed:=false; begin perform public.munka_cloud('calendar_list'); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'anonymous account accessed cloud'; end if;
end $$;
select 'sync, recipient-bound invites, roles, custom permissions, revisions, RLS and revocation passed' as result;
rollback;
