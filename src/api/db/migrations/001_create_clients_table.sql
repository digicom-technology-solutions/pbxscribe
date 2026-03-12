CREATE TABLE clients (
  id BIGSERIAL PRIMARY KEY,
  client_name VARCHAR(255) NOT NULL,
  client_category VARCHAR(255) NOT NULL,
  subscription_plan VARCHAR(255) NOT NULL,
  client_email VARCHAR(255) NOT NULL,
  client_address VARCHAR(255),
  client_phone VARCHAR(20),
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  client_status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (client_status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clients_email_unique UNIQUE (client_email)
);

CREATE INDEX IF NOT EXISTS idx_clients_email ON clients (client_email);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients (client_status);

INSERT INTO clients (
  client_name, 
  client_category, 
  subscription_plan, 
  client_email, 
  client_address, 
  client_phone, 
  timezone, 
  client_status
) VALUES (
  'Digicom Technology Solutions',
  'Internal',
  'Enterprise',
  'admin@dtsit.com',
  '123 System Ave, Tech City',
  '+15550100',
  'UTC',
  'active'
)