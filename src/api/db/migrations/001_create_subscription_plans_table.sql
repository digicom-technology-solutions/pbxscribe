CREATE TABLE subscription_plans (
  id BIGSERIAL PRIMARY KEY,
  plan_name VARCHAR(255) NOT NULL,
  plan_type VARCHAR(255) NOT NULL,
	CHECK (plan_type IN ('basic', 'pro', 'team', 'enterprise', 'custom')),
  plan_monthly_amount NUMERIC(10, 2) NOT NULL,
  plan_yearly_amount NUMERIC(10, 2) NOT NULL,
  plan_voicemails INT NOT NULL,
  plan_email_delivery BOOLEAN NOT NULL,
  plan_sms_delivery BOOLEAN NOT NULL,
  plan_voicebox BOOLEAN NOT NULL,
  plan_support VARCHAR(255) NOT NULL,
	CHECK (plan_support IN ('basic', 'priority', 'manager')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_plans_plan_name_unique UNIQUE (plan_name)
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_plan_name ON subscription_plans (plan_name);


INSERT INTO subscription_plans (
  plan_name, 
  plan_type, 
  plan_monthly_amount, 
  plan_yearly_amount, 
  plan_voicemails, 
  plan_email_delivery, 
  plan_sms_delivery, 
  plan_voicebox, 
  plan_support, 
  created_at, 
  updated_at
) VALUES 
(
  'Basic',
  'basic',
  25.00,
  275.00,
  250,
  true,
  true,
  true,
  'basic',
  NOW(),
  NOW()
),
(
  'Pro',
  'pro',
  50.00,
  575.00,
  500,
  true,
  true,
  true,
  'priority',
  NOW(),
  NOW()
),
(
  'Team',
  'team',
  75.00,
  850.00,
  750,
  true,
  true,
  true,
  'priority',
  NOW(),
  NOW()
),
(
  'Enterprise',
  'enterprise',
  125.00,
  1450.00,
  1500,
  true,
  true,
  true,
  'priority',
  NOW(),
  NOW()
),
(
  'Custom',
  'custom',
  0.00,
  0.00,
  0,
  true,
  true,
  true,
  'priority',
  NOW(),
  NOW()
);