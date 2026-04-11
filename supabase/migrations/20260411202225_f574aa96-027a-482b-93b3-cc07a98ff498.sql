
-- Create storage bucket for WhatsApp attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('wa-attachments', 'wa-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access for all files
CREATE POLICY "wa_attachments_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'wa-attachments');

-- Authenticated users can upload
CREATE POLICY "wa_attachments_auth_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'wa-attachments');

-- Authenticated users can delete their uploads
CREATE POLICY "wa_attachments_auth_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'wa-attachments');
