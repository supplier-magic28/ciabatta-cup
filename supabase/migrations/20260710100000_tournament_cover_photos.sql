-- Phase 5b: admin-managed tournament cover photos (ADR-0021).

alter table public.tournaments
  add column if not exists cover_image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tournament-images',
  'tournament-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tournament_images_public_read" on storage.objects;
drop policy if exists "tournament_images_admin_insert" on storage.objects;
drop policy if exists "tournament_images_admin_update" on storage.objects;
drop policy if exists "tournament_images_admin_delete" on storage.objects;

create policy "tournament_images_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'tournament-images');

create policy "tournament_images_admin_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'tournament-images' and public.is_admin());

create policy "tournament_images_admin_update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'tournament-images' and public.is_admin())
  with check (bucket_id = 'tournament-images' and public.is_admin());

create policy "tournament_images_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'tournament-images' and public.is_admin());
