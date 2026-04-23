CREATE TABLE logs (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  job_name VARCHAR(255) NOT NULL,
  job_status VARCHAR(255) NOT NULL,
  filename VARCHAR(255),
  email_attachment_type VARCHAR(255),
  email_subject VARCHAR(255),
  email_from_address VARCHAR(255),
  email_from_name VARCHAR(255),
  to_email_addresses TEXT,
  email_body TEXT,
  voicemail TEXT,
  delivery_status VARCHAR(255) NOT NULL,
  delivery_timestamp TIMESTAMPTZ,
  sms_delivery_status VARCHAR(255),
  sms_delivery_timestamp TIMESTAMPTZ,
  duration_ms BIGINT,
  message_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_client
    FOREIGN KEY (client_id) 
    REFERENCES clients(id) 
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_logs_job_name ON logs (job_name);
CREATE INDEX IF NOT EXISTS idx_logs_client_id ON logs (client_id);