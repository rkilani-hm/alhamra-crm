ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.case_categories(id);

NOTIFY pgrst, 'reload schema';