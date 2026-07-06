ALTER TABLE referrals DROP CONSTRAINT IF EXISTS fk_invoice;
ALTER TABLE referrals ALTER COLUMN invoice_id TYPE VARCHAR(50) USING invoice_id::text;
ALTER TABLE referrals ALTER COLUMN invoice_id DROP NOT NULL;
DROP INDEX IF EXISTS idx_referrals_invoice_id;
