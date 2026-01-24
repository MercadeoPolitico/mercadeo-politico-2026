-- Default ON: auto_publish_enabled
-- This keeps the system producing visible output without manual toggles.

begin;

alter table public.politicians
  alter column auto_publish_enabled set default true;

-- Backfill existing rows to ON (explicit request).
update public.politicians
set auto_publish_enabled = true
where auto_publish_enabled is distinct from true;

commit;

