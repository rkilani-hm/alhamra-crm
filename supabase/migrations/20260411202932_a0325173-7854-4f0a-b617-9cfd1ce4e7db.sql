ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS name_arabic text;
CREATE INDEX IF NOT EXISTS idx_organizations_name_arabic ON public.organizations(name_arabic);
NOTIFY pgrst, 'reload schema';