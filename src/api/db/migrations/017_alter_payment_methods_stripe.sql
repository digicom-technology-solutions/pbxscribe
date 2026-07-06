-- Replace raw card storage with Stripe-safe metadata.
-- Existing rows stored raw card data (card_number, security_code) which
-- is invalid going forward — they are deleted before the schema change.

-- Remove existing records (raw card data is no longer valid)
DELETE FROM payment_methods;

-- Drop old constraints and indexes on card_number
ALTER TABLE payment_methods DROP CONSTRAINT IF EXISTS payment_methods_card_number_unique;
DROP INDEX IF EXISTS idx_payment_methods_card_number;

-- Drop old columns, add Stripe metadata columns
ALTER TABLE payment_methods
  DROP COLUMN IF EXISTS card_number,
  DROP COLUMN IF EXISTS security_code,
  DROP COLUMN IF EXISTS expiry_date,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id VARCHAR(255) NOT NULL,
  ADD COLUMN IF NOT EXISTS brand       VARCHAR(50),
  ADD COLUMN IF NOT EXISTS last4       CHAR(4),
  ADD COLUMN IF NOT EXISTS exp_month   SMALLINT,
  ADD COLUMN IF NOT EXISTS exp_year    SMALLINT;

ALTER TABLE payment_methods
  ADD CONSTRAINT payment_methods_stripe_pm_unique UNIQUE (stripe_payment_method_id);

CREATE INDEX IF NOT EXISTS idx_payment_methods_stripe_pm
  ON payment_methods (stripe_payment_method_id);
