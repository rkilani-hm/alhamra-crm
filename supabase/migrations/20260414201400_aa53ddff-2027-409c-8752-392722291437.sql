INSERT INTO storage.buckets (id, name, public) VALUES ('case-attachments', 'case-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "case_attachments_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'case-attachments');
CREATE POLICY "case_attachments_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'case-attachments');
CREATE POLICY "case_attachments_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'case-attachments');
CREATE POLICY "case_attachments_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'case-attachments');