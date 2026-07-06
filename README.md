# PBXScribe

Voicemail transcription and delivery platform. Receives inbound voicemail audio via SES, transcribes it with AWS Transcribe, and delivers the transcript by email and SMS to the client.

**API**: `https://api.pbxscribe.com`  
**Docs**: `https://api.pbxscribe.com/dev/docs`

---

## Architecture

```
Inbound Email (SES)
        │
        ▼
  EmailS3Bucket ──────────────────────► Parser Lambda
  (s3:ObjectCreated)                    • Extracts voicemail attachment
                                        • Checks monthly usage vs plan limit
                                        • Inserts row into logs (or unprocessed_logs if over limit)
                                        • Copies audio to TranscriptionS3Bucket
                                        │
                                        ▼
                                  Init Lambda (s3:ObjectCreated on TranscriptionS3Bucket)
                                        • Reads job_name metadata from S3 object
                                        • Starts AWS Transcribe job
                                        • Updates logs.job_status → PROCESSING
                                        │
                                        ▼
                                  EventBridge (Transcribe COMPLETED)
                                        │
                                        ▼
                                  Processor Lambda
                                        • Fetches transcript from S3
                                        • Sends email via SES (nodemailer)
                                        • Sends SMS via Twilio
                                        • Updates logs.job_status → COMPLETED
                                        • Publishes delivery status to SNS
                                        │
                                        ▼
                                  SNS → Webhook Lambda
                                        • Handles SES delivery events
                                        • Updates logs.delivery_status / sms_delivery_status

HTTP Clients
        │
        ▼
  API Gateway (HTTP API v2)
  api.pbxscribe.com/dev
        │
        ▼
  API Lambda (Fastify v5 + @fastify/aws-lambda)
  • Auth, Users, Clients, Phone Numbers
  • Logs, Unprocessed Logs
  • Invoices, Subscription Plans
  • Payment Methods, Referrals
  • Support Tickets, API Keys
  • Health checks, DB migrations
```

### AWS Services

| Service | Usage |
|---|---|
| **Lambda** (nodejs22.x) | All compute — 5 functions |
| **API Gateway HTTP API v2** | HTTP routing to API Lambda |
| **RDS PostgreSQL** (v14+) | Primary database |
| **RDS Proxy** | Connection pooling for Lambda |
| **Secrets Manager** | DB credentials |
| **SSM Parameter Store** | JWT secret, migration secret |
| **SES** | Inbound email receipt + outbound delivery |
| **S3** | Email storage, transcription audio, support attachments, greetings |
| **AWS Transcribe** | Voicemail-to-text |
| **EventBridge** | Transcribe job completion events |
| **SNS** | SES delivery event notifications |
| **CloudWatch Logs** | Lambda logs |
| **Stripe** | Payment processing |
| **Twilio** | SMS delivery |

---

## Project Structure

```
pbxscribe/
├── deploy.sh                    # Main deployment script
├── setup-cicd.sh                # One-time CI/CD bootstrap
├── .env.example                 # Environment variable template
├── infra/
│   ├── foundation/
│   │   ├── network.yml          # VPC, subnets, security groups
│   │   ├── database.yml         # RDS PostgreSQL + RDS Proxy
│   │   ├── github-oidc.yml      # GitHub Actions OIDC IAM role
│   │   └── admin-ui-hosting.yml # S3 + CloudFront for frontend
│   └── services/
│       └── api.yml              # All Lambda functions + API Gateway
└── src/
    ├── api/                     # HTTP API Lambda (Fastify)
    │   ├── index.js             # Lambda handler entry point
    │   ├── app.js               # Fastify app factory
    │   ├── config/database.js   # Secrets Manager + pg Pool
    │   ├── db/
    │   │   ├── migrator.js      # Migration runner
    │   │   └── migrations/      # 16 SQL migration files
    │   ├── plugins/
    │   │   ├── auth.js          # Bearer JWT + ApiKey authentication
    │   │   ├── database.js      # Fastify pg decorator
    │   │   └── swagger.js       # OpenAPI 3.0 + Swagger UI (CDN)
    │   ├── repositories/        # 14 domain repositories (pg queries)
    │   ├── routes/              # 16 route modules
    │   └── utils/
    │       ├── apiKey.js        # pbx_ prefix keys + SHA-256 hashing
    │       ├── jwt.js           # 24h JWT tokens
    │       └── password.js      # bcrypt + strength validation
    ├── parser/index.mjs         # SES email → voicemail extraction
    ├── init/index.mjs           # S3 trigger → start Transcribe job
    ├── processor/index.mjs      # Transcribe COMPLETED → email + SMS
    └── webhook/index.mjs        # SES delivery events → DB update
```

---

## API Routes

All routes are prefixed with `/{environment}` (e.g. `/dev`).

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Service info |
| `GET` | `/health/db` | None | Database connectivity |
| `GET` | `/health/email` | None | SES connectivity |
| `GET` | `/health/file-storage` | None | S3 connectivity |
| `GET` | `/health/stripe` | None | Stripe connectivity |
| `GET` | `/health/cdn` | None | CDN connectivity |
| `GET` | `/ready` | None | Readiness probe |
| `GET` | `/live` | None | Liveness probe |
| `POST` | `/auth/register` | None | Register new user |
| `POST` | `/auth/login` | None | Login → JWT |
| `POST` | `/auth/2fa/setup` | JWT | Set up TOTP 2FA |
| `POST` | `/auth/2fa/verify` | JWT | Verify TOTP code |
| `POST` | `/auth/password-reset/request` | None | Send reset email |
| `POST` | `/auth/password-reset/confirm` | None | Confirm reset token |
| `PUT` | `/auth/password-change` | JWT | Change password |
| `GET/POST/PUT/DELETE` | `/users` | JWT | User management |
| `GET/POST/PUT/DELETE` | `/clients` | JWT | Client management |
| `GET/POST/PUT/DELETE` | `/phone-numbers` | JWT | Phone number management |
| `GET/POST/PUT/DELETE` | `/api-keys` | JWT | API key management |
| `GET/POST/PUT` | `/logs` | JWT/ApiKey | Voicemail log management |
| `GET/POST/PUT` | `/unprocessed-logs` | JWT | Over-limit voicemails |
| `GET/POST/PUT/DELETE` | `/invoices` | JWT | Invoice management |
| `GET/POST/PUT/DELETE` | `/subscription-plans` | JWT | Subscription plan management |
| `GET/POST/PUT/DELETE` | `/payment-methods` | JWT | Payment method management |
| `GET/POST/PUT/DELETE` | `/referrals` | JWT | Referral management |
| `GET/POST/PUT/DELETE` | `/support-tickets` | JWT | Support ticket management |
| `GET/POST` | `/ticket-messages` | JWT | Ticket message management |
| `GET/POST/PUT/DELETE` | `/whitelisted-ips` | JWT | IP whitelist management |
| `POST` | `/migrate` | Migration secret | Run DB migrations |

### Authentication

Two schemes are accepted on the same `Authorization` header:

- **JWT**: `Authorization: Bearer <token>` — obtained from `POST /auth/login`, expires in 24h
- **API Key**: `Authorization: ApiKey <key>` — obtained from `POST /api-keys`, stored as SHA-256 hash, prefixed `pbx_`

---

## Database Schema

```
subscription_plans
    └── clients
            └── users
                    └── user_credentials (passwords, API keys)
            └── payment_methods
            └── phone_numbers
            └── logs ──────────────── ticket_messages
            └── unprocessed_logs      support_tickets
            └── invoices              whitelisted_ips
            └── referrals             two_fa
                                      reset_password
```

### Voicemail log statuses

```
UPLOADED → PROCESSING → COMPLETED
                     └→ FAILED
```

### Plan enforcement

The `parser` Lambda checks `logs` count for the current month against `subscription_plans.plan_voicemails`. At 80% usage it sends an alert email. At 100% it writes to `unprocessed_logs` instead of `logs`.

---

## Prerequisites

- Node.js >= 20
- AWS CLI configured (`aws configure` or named profile)
- AWS account with appropriate IAM permissions
- Deployed foundation stacks (VPC, RDS) — see [Infrastructure Setup](#infrastructure-setup)

---

## Environment Setup

Copy `.env.example` to `.env.dev` (or `.env.prod`) and fill in:

```bash
cp .env.example .env.dev
```

| Variable | Description |
|---|---|
| `ENVIRONMENT` | `dev`, `staging`, or `prod` |
| `API_BASE_URL` | Full API URL e.g. `https://api.pbxscribe.com/dev` |
| `AWS_REGION` | e.g. `us-east-2` |
| `AWS_PROFILE` | AWS CLI profile name |
| `JWT_SECRET` | Min 32 characters |
| `MIGRATION_SECRET` | Min 16 characters |
| `PBXSCRIBE_DOMAIN` | e.g. `pbxscribe.com` |
| `TWILIO_ACCOUNT_SID` | From Twilio console |
| `TWILIO_AUTH_TOKEN` | From Twilio console |
| `TWILIO_PHONENUMBER_DEFAULT` | E.164 format e.g. `+15551234567` |
| `SES_FROM_EMAIL` | Verified SES sender address |

---

## Infrastructure Setup

Deploy foundation stacks once before the services stack. Each stack exports values consumed by the next.

```bash
# 1. Network (VPC, subnets, security groups)
aws cloudformation deploy \
  --template-file infra/foundation/network.yml \
  --stack-name pbxscribe-network-dev \
  --parameter-overrides Environment=dev

# 2. Database (RDS PostgreSQL + RDS Proxy)
aws cloudformation deploy \
  --template-file infra/foundation/database.yml \
  --stack-name pbxscribe-database-dev \
  --parameter-overrides Environment=dev \
  --capabilities CAPABILITY_NAMED_IAM

# 3. GitHub OIDC (for CI/CD keyless auth — run once per account)
aws cloudformation deploy \
  --template-file infra/foundation/github-oidc.yml \
  --stack-name pbxscribe-github-oidc \
  --capabilities CAPABILITY_NAMED_IAM
```

---

## Deployment

```bash
# Full deploy (infra + code)
./deploy.sh dev

# Infrastructure only (CloudFormation stack)
./deploy.sh dev --infra-only

# Code only (Lambda zip upload, skips CloudFormation)
./deploy.sh dev --code-only

# Deploy and run database migrations
./deploy.sh dev --code-only --migrate

# Drop all tables, re-migrate (destructive — use with caution)
./deploy.sh dev --migrate --drop-tables
```

The script:
1. Loads `.env.<environment>` (shell env vars take precedence)
2. Deploys or updates the `api.yml` CloudFormation stack
3. Packages `src/api`, installs production dependencies, zips, and uploads to Lambda
4. Optionally calls `POST /{env}/migrate` with the migration secret

---

## CI/CD

GitHub Actions workflows in `.github/workflows/deploy-api.yml`:

| Branch pattern | Target | Action |
|---|---|---|
| `feature/*` | `dev` environment | `deploy.sh dev --code-only` |
| `main` | `prod` environment | `deploy.sh prod --code-only` |

Authentication uses GitHub OIDC (keyless) — no AWS credentials stored in GitHub secrets. The OIDC role is provisioned by `infra/foundation/github-oidc.yml`.

---

## Local Development

```bash
cd src/api
npm install
node tests/lambda/test-local.js
```

The test file invokes the Fastify app directly without going through Lambda/API Gateway.

---

## Running Migrations

Migrations run in order, each in a transaction, tracked in `schema_migrations`. Safe to re-run — already-applied migrations are skipped.

```bash
# Via deploy script
./deploy.sh dev --migrate

# Directly via curl
curl -X POST https://api.pbxscribe.com/dev/migrate \
  -H "x-migration-secret: <MIGRATION_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{}'
```
