CREATE TABLE logs (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  caller_id VARCHAR(50) NOT NULL,
  username VARCHAR(50) NOT NULL,
  deliver_to VARCHAR(50) NOT NULL,
  email_status VARCHAR(255) NOT NULL,
  delivery_status VARCHAR(255) NOT NULL,
  delivery_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_client
    FOREIGN KEY (client_id) 
    REFERENCES clients(id) 
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_logs_caller_id ON logs (caller_id);
CREATE INDEX IF NOT EXISTS idx_logs_client_id ON logs (client_id);