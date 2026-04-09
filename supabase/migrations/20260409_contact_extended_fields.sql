-- Migration: Extend contacts table with SAP, vendor and visitor fields
-- Run after the base migration

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS client_type TEXT
    CHECK (client_type IN ('existing_tenant','potential','vendor','visitor')),
  ADD COLUMN IF NOT EXISTS sap_bp_number TEXT,
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS floor TEXT,
  ADD COLUMN IF NOT EXISTS contract_number TEXT,
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS vendor_type TEXT,
  ADD COLUMN IF NOT EXISTS id_number TEXT,
  ADD COLUMN IF NOT EXISTS host_name TEXT,
  ADD COLUMN IF NOT EXISTS visit_purpose TEXT;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS contacts_phone_idx ON public.contacts(phone);
CREATE INDEX IF NOT EXISTS contacts_sap_bp_idx ON public.contacts(sap_bp_number);

-- Seed additional departments for leasing & procurement
INSERT INTO public.departments (name) VALUES
  ('Leasing'), ('Procurement')
ON CONFLICT DO NOTHING;
