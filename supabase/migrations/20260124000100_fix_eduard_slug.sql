begin;

-- Canonicalize public slug spelling: Eduard (not Eduardo).
-- Keep stable internal id as-is to avoid breaking foreign keys and automation.
update public.politicians
set slug = 'eduard-buitrago',
    updated_at = now()
where id = 'eduardo-buitrago'
  and slug <> 'eduard-buitrago';

commit;

