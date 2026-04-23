CREATE TABLE clients (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  client_category VARCHAR(255) NOT NULL,
  client_email VARCHAR(255) NOT NULL,
  client_address VARCHAR(255),
  client_phone VARCHAR(20),
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  client_status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (client_status IN ('active', 'inactive', 'suspended')),
  client_referral_link VARCHAR(255),
  delivery_failure_notification BOOLEAN NOT NULL DEFAULT FALSE,
  usage_alert_notification BOOLEAN NOT NULL DEFAULT FALSE,
  system_alert_notification BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  pbx_tag_format VARCHAR(255),
  tls_encryption_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clients_email_unique UNIQUE (client_email),
  CONSTRAINT fk_plan
    FOREIGN KEY (plan_id) 
    REFERENCES subscription_plans(id) 
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clients_email ON clients (client_email);
CREATE INDEX IF NOT EXISTS idx_clients_pbx_tag_format ON clients (pbx_tag_format);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients (client_status);
CREATE INDEX IF NOT EXISTS idx_clients_plan_id ON clients (plan_id);
CREATE INDEX IF NOT EXISTS idx_clients_referral_link ON clients (client_referral_link);

-- INSERT INTO clients (
--   plan_id,
--   client_name, 
--   client_category, 
--   client_email, 
--   client_address, 
--   client_phone, 
--   timezone, 
--   client_status,
--   client_referral_link,
--   delivery_failure_notification,
--   usage_alert_notification,
--   system_alert_notification,
--   stripe_customer_id,
--   stripe_subscription_id,
--   pbx_tag_format,
--   tls_encryption_enabled
-- ) VALUES (
--   '1',
--   'Digicom Technology Solutions',
--   'Internal',
--   'admin@dtsit.com',
--   '123 System Ave, Tech City',
--   '+15550100',
--   'UTC',
--   'active',
--   'https://pbxscribe.com/referral/31236f14-1544-45c2-86ec-d5198d57070e',
--   TRUE,	
--   TRUE,
--   TRUE,
--   'cus_UIs7V2dwEjnjdU',
--   'sub_1TKGPbGvtWTEgQjMORoPZu0Z',
--   'Caller ID:',
--   TRUE
-- );