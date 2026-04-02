CREATE TABLE two_fa (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  two_fa VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_client
    FOREIGN KEY (client_id)
    REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_two_fa_client_id ON two_fa (client_id);
CREATE INDEX IF NOT EXISTS idx_two_fa_email ON two_fa (email);
CREATE INDEX IF NOT EXISTS idx_two_fa_user_id ON two_fa (user_id);