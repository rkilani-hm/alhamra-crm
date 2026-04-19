-- ── intake-attachments storage bucket ───────────────────────
-- Public bucket for web intake form file uploads.
-- Anon users can upload (INSERT) — authenticated users can read.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'intake-attachments',
  'intake-attachments',
  true,                           -- public: anyone can read via public URL
  5242880,                        -- 5 MB limit enforced server-side
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public             = true,
  file_size_limit    = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','application/pdf'];

-- Anon can upload to intake-attachments (public form)
CREATE POLICY IF NOT EXISTS "intake_anon_upload"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'intake-attachments');

-- Authenticated users can read
CREATE POLICY IF NOT EXISTS "intake_auth_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'intake-attachments');

-- Public can read (needed for public: true bucket)
CREATE POLICY IF NOT EXISTS "intake_public_read"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'intake-attachments');
