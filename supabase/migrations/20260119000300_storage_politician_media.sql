-- Supabase Storage bucket for politician media (images/videos)
-- Public bucket: assets can be embedded in posts without auth.
-- Upload/delete restricted to authenticated admins via RLS policies.

begin;

-- Bucket
insert into storage.buckets (id, name, public)
values ('politician-media', 'politician-media', true)
on conflict (id) do nothing;

-- Policies on storage.objects (RLS must be enabled in Supabase Storage)
drop policy if exists "politician_media_admin_select" on storage.objects;
create policy "politician_media_admin_select"
on storage.objects
for select
to authenticated
using (bucket_id = 'politician-media' and public.is_admin());

drop policy if exists "politician_media_admin_insert" on storage.objects;
create policy "politician_media_admin_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'politician-media' and public.is_admin());

drop policy if exists "politician_media_admin_update" on storage.objects;
create policy "politician_media_admin_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'politician-media' and public.is_admin())
with check (bucket_id = 'politician-media' and public.is_admin());

drop policy if exists "politician_media_admin_delete" on storage.objects;
create policy "politician_media_admin_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'politician-media' and public.is_admin());

commit;

