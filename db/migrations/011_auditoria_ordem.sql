-- O número do evento passa a ser atribuído dentro da trava da corrente,
-- garantindo que a ordem dos números seja a mesma ordem do encadeamento
-- mesmo com gravações simultâneas.
create or replace function app.audit_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare last_hash text;
begin
  perform pg_advisory_xact_lock(778899);
  new.id := nextval('audit_log_id_seq');
  select hash into last_hash from audit_log order by id desc limit 1;
  new.prev_hash := coalesce(last_hash, repeat('0', 64));
  new.at := clock_timestamp();
  new.hash := encode(sha256(convert_to(app.audit_payload(new), 'UTF8')), 'hex');
  return new;
end $$;
