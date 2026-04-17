-- Raise the 'uploads' bucket file_size_limit from the 50 MiB default to 100 MiB.
-- The frontend (UploadPdfTab.svelte) and manual-upload edge function both
-- advertise/enforce a 100 MB limit, but the bucket itself silently rejected
-- anything over ~50 MiB with a 413 at the signed-URL PUT step — surfacing as
-- a generic "Datei-Upload fehlgeschlagen" in the UI.

UPDATE storage.buckets
   SET file_size_limit = 104857600  -- 100 MiB
 WHERE id = 'uploads';
