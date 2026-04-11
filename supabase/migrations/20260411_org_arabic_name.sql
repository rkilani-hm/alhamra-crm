-- Add Arabic name column to organizations table
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS name_arabic text;

-- Index for Arabic name search
CREATE INDEX IF NOT EXISTS idx_organizations_name_arabic ON public.organizations(name_arabic);
