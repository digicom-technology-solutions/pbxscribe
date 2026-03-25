CREATE TABLE phone_numbers (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  phone_number VARCHAR(50) NOT NULL,
  phone_number_sid VARCHAR(50) NOT NULL,
  phone_type VARCHAR(50) NOT NULL,
  friendly_name VARCHAR(255) NOT NULL,
  voice_capabilities BOOLEAN NOT NULL,
  sms_capabilities BOOLEAN NOT NULL,
  mms_capabilities BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT phone_numbers_phone_number_unique UNIQUE (phone_number),
  CONSTRAINT fk_client
    FOREIGN KEY (client_id) 
    REFERENCES clients(id) 
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_phone_numbers_phone_number ON phone_numbers (phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_client_id ON phone_numbers (client_id);