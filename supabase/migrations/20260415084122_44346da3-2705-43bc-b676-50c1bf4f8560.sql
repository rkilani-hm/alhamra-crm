CREATE TABLE IF NOT EXISTS public.quick_replies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text NOT NULL,
  category    text NOT NULL DEFAULT 'Other',
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qr_read"   ON public.quick_replies FOR SELECT TO authenticated USING (true);
CREATE POLICY "qr_write"  ON public.quick_replies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qr_delete" ON public.quick_replies FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.get_my_role() = 'manager');

INSERT INTO public.quick_replies (title, body, category) VALUES
  ('Hello (English)',   'Hello! Thank you for contacting Al Hamra Real Estate. How can I assist you today?', 'Greeting'),
  ('Hello (Arabic)',    'مرحباً! شكراً لتواصلكم مع الحمراء للعقارات. كيف يمكنني مساعدتكم اليوم؟', 'Greeting'),
  ('Will follow up',    'Thank you for your message. I will look into this and get back to you shortly.', 'Closing'),
  ('Case created',      'I have registered your request. Our team will contact you within 1 business day. Please keep this chat open for updates.', 'Closing'),
  ('Leasing enquiry',   'Thank you for your interest! Could you please share: your preferred area (sqm), budget (KWD/month), and desired move-in date?', 'Leasing'),
  ('Maintenance ack',   'We have received your maintenance request and forwarded it to our Facilities Management team. They will contact you to schedule a visit.', 'Maintenance'),
  ('Call us',           'For urgent matters, please call us at +965 2222 9999 (Sun–Thu, 8am–5pm).', 'Other'),
  ('Thank you closing', 'Thank you for choosing Al Hamra Real Estate. If you need anything further, feel free to message us anytime. Have a great day!', 'Closing')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';