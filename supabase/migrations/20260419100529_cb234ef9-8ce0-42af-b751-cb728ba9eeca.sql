-- intake-attachments storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'intake-attachments',
  'intake-attachments',
  true,
  5242880,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public             = true,
  file_size_limit    = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','application/pdf'];

DROP POLICY IF EXISTS "intake_anon_upload" ON storage.objects;
CREATE POLICY "intake_anon_upload"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'intake-attachments');

DROP POLICY IF EXISTS "intake_auth_read" ON storage.objects;
CREATE POLICY "intake_auth_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'intake-attachments');

DROP POLICY IF EXISTS "intake_public_read" ON storage.objects;
CREATE POLICY "intake_public_read"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'intake-attachments');