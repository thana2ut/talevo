-- Owner approved reviewed SQL on 2026-11-17. No user rows are deleted.
update storage.buckets set public = false where id = 'profile-avatars';
