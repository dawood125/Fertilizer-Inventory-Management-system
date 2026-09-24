/*
# Add customer pricing preferences

Adds default_price_type, allow_manual_override, and custom_price fields to customers
so the system can auto-load the customer's default price tier when creating a sales order.
Non-destructive: uses ADD COLUMN IF NOT EXISTS.
*/

DO $$ BEGIN
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS default_price_type text DEFAULT 'retail';
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS allow_manual_override boolean DEFAULT false;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS custom_price numeric(12,2) DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
