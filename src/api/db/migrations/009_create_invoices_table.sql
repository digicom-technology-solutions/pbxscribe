CREATE TABLE invoices (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  invoice_name VARCHAR(255) NOT NULL,
  invoice_type VARCHAR(255) NOT NULL,
	CHECK (invoice_type IN ('monthly', 'promotion', 'yearly')),
  invoice_date TIMESTAMPTZ NOT NULL,
  plan_id BIGINT NOT NULL,
  invoice_amount NUMERIC(10, 2) NOT NULL,
  invoice_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    CHECK (invoice_status IN ('pending', 'paid', 'overdue')),
  invoice_file_url VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoices_invoice_name_unique UNIQUE (invoice_name),
  CONSTRAINT fk_client
    FOREIGN KEY (client_id) 
    REFERENCES clients(id) 
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_name ON invoices (invoice_name);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (invoice_status);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices (client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_type ON invoices (invoice_type);