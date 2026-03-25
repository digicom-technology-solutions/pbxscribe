CREATE TABLE support_tickets (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  case_title VARCHAR(255) NOT NULL,
  case_description TEXT NOT NULL,
  case_status VARCHAR(20) NOT NULL,
	CHECK (case_status IN ('open', 'in_progress', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_client
    FOREIGN KEY (client_id) 
    REFERENCES clients(id) 
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets (case_status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_client_id ON support_tickets (client_id);