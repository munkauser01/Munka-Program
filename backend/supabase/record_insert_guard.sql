-- Apply the revision guard to inserts as well as updates.
drop trigger munka_record_revision on public.munka_records;
create trigger munka_record_revision
before insert or update on public.munka_records
for each row execute function munka_private.record_revision();
