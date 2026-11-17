-- REVIEW ONLY. Owner approval is required before running on production.
-- Deploy the /api/profile/avatar route and profile UI first on all used hosts.
-- Effect: public Storage URLs stop serving profile pictures. Existing objects
-- and avatar references remain; the new route understands old references.
-- Existing SELECT/INSERT/UPDATE/DELETE policies restrict the first folder to
-- auth.uid(). No policy is loosened and no image or user row is deleted.
-- Previously downloaded copies cannot be recalled; old CDN copies may persist.
begin;
update storage.buckets set public = false where id = 'profile-avatars';
commit;

-- Verify without reading user images:
select id, public from storage.buckets where id = 'profile-avatars';
