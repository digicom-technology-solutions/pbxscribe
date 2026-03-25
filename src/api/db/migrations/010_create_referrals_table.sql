CREATE TABLE referrals (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  referral_client_id BIGINT,
  invoice_id BIGINT NOT NULL,
  referral_bonus NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_client
    FOREIGN KEY (client_id) 
    REFERENCES clients(id) 
    ON DELETE CASCADE,
  CONSTRAINT fk_invoice
    FOREIGN KEY (invoice_id) 
    REFERENCES invoices(id) 
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_referrals_client_id ON referrals (client_id);
CREATE INDEX IF NOT EXISTS idx_referrals_invoice_id ON referrals (invoice_id);