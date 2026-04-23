CREATE TABLE whitelisted_ips (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  ip_address VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_client
    FOREIGN KEY (client_id)
    REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_whitelisted_ips_client_id ON whitelisted_ips (client_id);
CREATE INDEX IF NOT EXISTS idx_whitelisted_ips_ip_address ON whitelisted_ips (ip_address);