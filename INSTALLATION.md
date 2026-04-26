# ES Studio API Installation and Run Guide

## What This Project Needs

- Node.js 20+
- npm 10+
- PostgreSQL 15+
- Redis 7+
- Optional external integrations:
  - Meta App credentials
  - Google BigQuery credentials
  - SMTP credentials

## 1. Clone and install

```bash
git clone <your-repo-url>
cd ES_Studio_API
npm install
```

## 2. Create environment config

Copy the example file and fill in the values you need:

```bash
cp .env.example .env
```

Minimum required values for local boot:

```env
PORT=5000
APP_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3000
JWT_SECRET=change-me-access-secret
JWT_REFRESH_SECRET=change-me-refresh-secret
SETUP_SECRET=change-me-setup-secret
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_NAME=social_studio_db
DB_SSL=false
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_TLS=false
```

Optional values:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` for Google OAuth signup/login
- `META_APP_ID`, `META_APP_SECRET` for Meta connect/sync endpoints
- `BIGQUERY_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS` for UTM analytics sync/query flows
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` for email report delivery and signup verification emails

## 3. Start PostgreSQL and Redis

If you already have local services, use those. Otherwise use Docker just for the dependencies:

```bash
docker compose up -d postgres-db redis-cache
```

## 4. Run database migrations

The project uses TypeORM migrations and expects `synchronize=false`.

```bash
npm run migration:run
```

Useful migration commands:

```bash
npm run migration:show
npm run migration:revert
```

## 5. Start the API

Development mode:

```bash
npm run start:dev
```

Production-like mode:

```bash
npm run build
npm run start:prod
```

The API will listen on `http://localhost:5000` unless you change `PORT`.

## 6. Smoke-test the server

Health check:

```bash
curl http://localhost:5000/health
```

Expected response:

```json
{"status":"ok"}
```

## 7. Create the first admin user

Use the setup route once the server is running:

```bash
curl -X POST http://localhost:5000/api/auth/setup \
  -H "Content-Type: application/json" \
  -H "x-setup-secret: change-me-setup-secret" \
  -d '{"email":"admin@example.com","password":"StrongPass123"}'
```

Then log in through `/api/auth/login`.

## Signup and onboarding flow

The backend now also supports self-serve account creation:

- `POST /api/auth/register`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `GET /api/auth/verify-email?token=...`
- `POST /api/auth/workspace/create`

Frontend routes expected by the backend redirects:

- `/signup`
- `/login`
- `/verify-email`
- `/onboarding`
- `/dashboard`

Important routing contract:

- no JWT: frontend should redirect to `/signup`
- JWT with `workspaceId = null`: frontend should allow `/onboarding`
- JWT with `workspaceId` set: frontend should redirect from `/onboarding` to `/dashboard`

## 8. Postman collection

Use [postman.collection.json](/Users/shubhamjoshi/ES_Studio_API/postman.collection.json) to test the API surface.

Important auth note:

- The current login flow stores auth in cookies.
- Ops endpoints require a JWT payload that includes `workspaceId`.
- Users without a workspace should complete `/api/auth/workspace/create` through the onboarding flow before accessing workspace-scoped APIs.

## Running Everything With Docker

This repo includes:

- `DockerFile`
- `docker-compose.yml`
- `docker/entrypoint.sh`

The backend container waits for Postgres and Redis, runs migrations, and then starts NestJS.

### Start all services

```bash
docker compose up --build
```

### Stop all services

```bash
docker compose down
```

### Stop and remove database volumes

```bash
docker compose down -v
```

### Services exposed locally

- API: `http://localhost:5000`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

## Troubleshooting

### `Invalid or expired authentication token`

- Clear cookies and log in again.
- Confirm `JWT_SECRET` and `JWT_REFRESH_SECRET` did not change between runs.

### Ops endpoints return `No workspace associated with this session`

- This is expected with the current Phase 1 login flow.
- The JWT needs a `workspaceId` claim, but `/api/auth/login` does not populate one yet.

### BigQuery endpoints fail locally

- Set `BIGQUERY_PROJECT_ID`.
- Provide Google credentials via `GOOGLE_APPLICATION_CREDENTIALS`.
- If you do not need UTM sync locally, leave those vars empty and avoid those endpoints.

### Email report sending fails

- Configure `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS`.
- `POST /v1/email-reports/send-test` returns a failure message when SMTP is missing.
