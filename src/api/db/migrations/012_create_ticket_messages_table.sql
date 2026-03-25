CREATE TABLE ticket_messages (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL,
  message_content VARCHAR(255) NOT NULL,
  message_timestamp TEXT NOT NULL,
  attachment_filename VARCHAR(255),
  attachment_contenttype VARCHAR(50),
  attachment_url VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_ticket
    FOREIGN KEY (ticket_id)
    REFERENCES support_tickets(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages (ticket_id);