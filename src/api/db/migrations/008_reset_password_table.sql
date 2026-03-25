CREATE TABLE reset_password (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,	
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ DEFAULT NULL,
  CONSTRAINT reset_password_email_unique UNIQUE (email),
  CONSTRAINT fk_client
    FOREIGN KEY (client_id) 
    REFERENCES clients(id) 
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reset_password_email ON reset_password (email);
CREATE INDEX IF NOT EXISTS idx_reset_password_client_id ON reset_password (client_id);