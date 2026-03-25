CREATE TABLE payment_methods (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  card_number VARCHAR(255) NOT NULL,
  cardholder_name VARCHAR(255) NOT NULL,
  security_code VARCHAR(255) NOT NULL,
  expiry_date VARCHAR(10) NOT NULL,
  card_status VARCHAR(50) NOT NULL,
	CHECK (card_status IN ('active', 'inactive', 'expired')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_methods_card_number_unique UNIQUE (card_number),
  CONSTRAINT fk_client
    FOREIGN KEY (client_id) 
    REFERENCES clients(id) 
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_card_number ON payment_methods (card_number);
CREATE INDEX IF NOT EXISTS idx_payment_methods_client_id ON payment_methods (client_id);