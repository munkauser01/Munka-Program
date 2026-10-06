-- Live RLS smoke test. All synthetic accounts and rows are rolled back.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','munka-owner@test.invalid',now()),
 ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb','munka-editor@test.invalid',now()),
 ('cccccccc-cccc-4ccc-cccc-cccccccccccc','munka-viewer@test.invalid',now()),
 ('dddddddd-dddd-4ddd-dddd-dddddddddddd','munka-stranger@test.invalid',now());
insert into public.munka_spaces(id,owner_id,kind,name) values
 ('test-calendar','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','calendar','Test');
insert into public.munka_space_members(space_id,user_id,role) values
 ('test-calendar','bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb','editor'),
 ('test-calendar','cccccccc-cccc-4ccc-cccc-cccccccccccc','viewer');
insert into public.munka_records(id,owner_id,kind,body) values
 ('personal-task','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','task','{"id":"personal-task","title":"Private"}');
insert into public.munka_records(id,owner_id,space_id,kind,body) values
 ('shared-event','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','test-calendar','event','{"id":"shared-event","title":"Shared"}');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-4ccc-cccc-cccccccccccc","is_anonymous":false}',true);
do $$
declare n integer;
begin
 if (select count(*) from public.munka_records) <> 1 then raise exception 'viewer record isolation failed'; end if;
 if (select count(*) from public.munka_record_history) <> 1 then raise exception 'viewer history isolation failed'; end if;
 if (select count(*) from public.munka_space_members) <> 1 then raise exception 'viewer membership isolation failed'; end if;
 update public.munka_records set body='{"id":"shared-event","title":"Wrong"}'::jsonb where id='shared-event';
 get diagnostics n = row_count;
 if n <> 0 then raise exception 'viewer write isolation failed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb","is_anonymous":false}',true);
do $$
declare n integer;
begin
 update public.munka_records set body='{"id":"shared-event","title":"Edited"}'::jsonb where id='shared-event';
 get diagnostics n = row_count;
 if n <> 1 then raise exception 'editor update failed'; end if;
 update public.munka_records set body='{"id":"personal-task","title":"Wrong"}'::jsonb where id='personal-task';
 get diagnostics n = row_count;
 if n <> 0 then raise exception 'editor reached private task'; end if;
 if (select version from public.munka_records where id='shared-event') <> 2 then raise exception 'revision trigger failed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa","is_anonymous":false}',true);
do $$ begin
 if (select count(*) from public.munka_records) <> 2 then raise exception 'owner record access failed'; end if;
 if (select count(*) from public.munka_space_members) <> 2 then raise exception 'owner membership access failed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"dddddddd-dddd-4ddd-dddd-dddddddddddd","is_anonymous":false}',true);
do $$ begin
 if (select count(*) from public.munka_records) <> 0 then raise exception 'stranger record isolation failed'; end if;
 if (select count(*) from public.munka_spaces) <> 0 then raise exception 'stranger space isolation failed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa","is_anonymous":true}',true);
do $$ begin
 if (select count(*) from public.munka_records) <> 0 then raise exception 'anonymous Auth user isolation failed'; end if;
end $$;
reset role;
delete from public.munka_space_members where space_id='test-calendar' and user_id='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb","is_anonymous":false}',true);
do $$ begin
 if (select count(*) from public.munka_records) <> 0 then raise exception 'revocation failed'; end if;
 if (select count(*) from public.munka_record_history) <> 0 then raise exception 'revoked history access failed'; end if;
end $$;
select 'all access checks passed' as marker;
rollback;
