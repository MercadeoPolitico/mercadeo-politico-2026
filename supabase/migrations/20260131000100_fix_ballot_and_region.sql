-- Fix ballot numbers + territory correctness (idempotent)
-- Requirements from ops:
-- - Eduard Buitrago Acero: tarjetón 22 (Senado, alcance nacional)
-- - José Ángel Martínez: tarjetón 103 (Cámara, Departamento del Meta)

begin;

update public.politicians
set ballot_number = 103,
    region = 'Meta',
    updated_at = now()
where id = 'jose-angel-martinez'
  and (
    ballot_number is distinct from 103
    or region is distinct from 'Meta'
  );

update public.politicians
set ballot_number = 22,
    region = 'Colombia',
    updated_at = now()
where id = 'eduardo-buitrago'
  and (
    ballot_number is distinct from 22
    or region is distinct from 'Colombia'
  );

commit;

