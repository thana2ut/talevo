-- Safari may not support canvas WebP encoding and can fall back to PNG.
-- The client now requests JPEG in that case, so allow its actual MIME type.
update storage.buckets
set allowed_mime_types = array['image/webp', 'image/jpeg']
where id = 'profile-avatars';
