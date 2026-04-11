
CREATE OR REPLACE FUNCTION public.validate_lease_status()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.lease_status IS NOT NULL AND NEW.lease_status NOT IN ('active','expired','pending','terminated') THEN
    RAISE EXCEPTION 'Invalid lease_status: %', NEW.lease_status;
  END IF;
  RETURN NEW;
END;
$$;
