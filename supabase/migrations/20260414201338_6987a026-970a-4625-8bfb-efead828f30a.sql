-- P1a: Case Attachments
CREATE TABLE IF NOT EXISTS public.case_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  file_name    text NOT NULL,
  file_url     text NOT NULL,
  file_size    bigint,
  mime_type    text,
  uploaded_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.case_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attachments_read"   ON public.case_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "attachments_insert" ON public.case_attachments FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('frontdesk','manager'));
CREATE POLICY "attachments_delete" ON public.case_attachments FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.get_my_role() = 'manager');

CREATE INDEX IF NOT EXISTS idx_attachments_case ON public.case_attachments(case_id);

-- P1c: In-app Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text,
  link        text,
  read        boolean DEFAULT false,
  case_id     uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifs_read"   ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "notifs_insert" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "notifs_update" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "notifs_delete" ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_notifications_user     ON public.notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread   ON public.notifications(user_id) WHERE read = false;

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Trigger: notify when a case is assigned to a dept
CREATE OR REPLACE FUNCTION public.notify_case_assigned()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link, case_id)
  SELECT
    p.id,
    'case_assigned',
    'New case assigned',
    COALESCE(NEW.subject, 'A new case has been assigned to your department'),
    '/follow-up',
    NEW.id
  FROM public.profiles p
  WHERE p.department_id = NEW.department_id
    AND p.id != COALESCE(NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_case_assigned ON public.cases;
CREATE TRIGGER on_case_assigned
  AFTER INSERT ON public.cases
  FOR EACH ROW
  WHEN (NEW.department_id IS NOT NULL)
  EXECUTE FUNCTION public.notify_case_assigned();