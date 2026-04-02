CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  firstname VARCHAR(255) NOT NULL,
  lastname VARCHAR(255) NOT NULL,
  pbx_email VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  sms_notification BOOLEAN NOT NULL DEFAULT false,
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  user_type VARCHAR(20) NOT NULL DEFAULT 'console',
	CHECK (user_type IN ('console', 'api')),
  user_status VARCHAR(20) NOT NULL DEFAULT 'enabled',
    CHECK (user_status IN ('enabled', 'disabled')),
  user_role VARCHAR(20) NOT NULL DEFAULT 'viewer',
    CHECK (user_role IN ('viewer', 'manager', 'admin')),
  two_fa_enabled BOOLEAN NOT NULL DEFAULT false,
  two_fa_secret VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT fk_client
    FOREIGN KEY (client_id) 
    REFERENCES clients(id) 
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (user_status);
CREATE INDEX IF NOT EXISTS idx_users_client_id ON users (client_id);