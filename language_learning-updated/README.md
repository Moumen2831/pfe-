# Language Learning App

A full-stack language learning platform with a **React + TypeScript** (Vite) frontend and a **Node.js + Express + tRPC** backend, backed by **PostgreSQL** via **Drizzle ORM**. The IELTS test section fetches AI-generated questions from a separate **IELTS backend** service (Express + PostgreSQL + Groq).

---

## Architecture Overview

```
┌─────────────────────────────────────────┐
│        Browser (React / Vite)           │
│                                         │
│  IeltsTestPage  ──fetch──▶ /api/ielts-questions
│  All other pages ──tRPC──▶ /api/trpc    │
└────────────────────┬────────────────────┘
                     │ HTTP (same origin)
┌────────────────────▼────────────────────┐
│   Language Learning Server (port 3000)  │
│                                         │
│  Express                                │
│   ├── /api/trpc         → tRPC routers  │
│   ├── /api/ielts-questions ─── proxy ──▶│──────┐
│   ├── /api/texts           ─── proxy ──▶│      │
│   └── /api/oauth/callback  → OAuth      │      │
│                                         │      │
│  PostgreSQL (Drizzle ORM)               │      │
│   users, lessons, quiz_attempts,        │      │
│   ielts_results, streaks, …             │      │
└─────────────────────────────────────────┘      │
                                                  │ HTTP
┌─────────────────────────────────────────────────▼──┐
│         IELTS Backend (port 3001)                   │
│                                                     │
│  Express                                            │
│   ├── GET  /api/ielts-questions  → serve 80 Qs      │
│   ├── POST /api/texts            → add source text  │
│   └── GET  /api/health           → health check     │
│                                                     │
│  PostgreSQL (separate DB)                           │
│   source_texts, ielts_questions                     │
│                                                     │
│  Groq AI (llama-3.3-70b) — generates questions     │
└─────────────────────────────────────────────────────┘
```

---

## Project Structure

```
language_learning/
├── client/                     # React frontend
│   └── src/
│       ├── pages/
│       │   └── IeltsTestPage.tsx   ← fetches from /api/ielts-questions proxy
│       ├── _core/hooks/useAuth.ts  ← tRPC auth
│       └── lib/trpc.ts
│
├── server/
│   ├── _core/
│   │   ├── index.ts            ← Express entry + IELTS proxy routes
│   │   ├── context.ts          ← tRPC context + dev auth bypass
│   │   ├── oauth.ts            ← OAuth callback
│   │   └── env.ts
│   ├── db.ts                   ← All DB queries (Drizzle + pg)
│   └── routers.ts              ← tRPC routers (incl. ielts.submitResult)
│
├── drizzle/
│   └── schema.ts               ← PostgreSQL schema (pg-core)
│
├── ielts-backend/              ← Separate service (copy here or run alongside)
│   └── src/
│       ├── index.js            ← Express + REST API
│       ├── db.js               ← pg Pool
│       ├── generateQuestions.js← Groq AI question generation
│       ├── migrate.js          ← DB migration
│       └── scheduler.js        ← Nightly generation cron
│
├── .env.example                ← All required env vars documented
└── README.md
```

---

## Getting Started (Localhost)

### Prerequisites

- Node.js ≥ 18
- pnpm (`npm i -g pnpm`)
- PostgreSQL running locally (or a hosted instance)

### 1. Install dependencies

```bash
# Main app
pnpm install

# IELTS backend
cd ielts-backend
npm install
```

### 2. Create two databases

```sql
-- In psql or your PostgreSQL client:
CREATE DATABASE language_learning;
CREATE DATABASE ielts_db;
```

### 3. Configure environment variables

**Main app** — copy and fill `.env.example` → `.env`:

```env
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/language_learning
JWT_SECRET=replace-with-a-long-random-secret
IELTS_BACKEND_URL=http://localhost:3001
DEV_USER_ID=1          # skip OAuth during local dev
PORT=3000
```

**IELTS backend** — create `ielts-backend/.env`:

```env
GROQ_API_KEY=your-groq-api-key   # free at console.groq.com
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ielts_db
DB_USER=postgres
DB_PASSWORD=yourpassword
PORT=3001
```

### 4. Run migrations

```bash
# Main app tables (users, lessons, ielts_results, …)
pnpm db:push

# IELTS backend tables (source_texts, ielts_questions)
cd ielts-backend
npm run migrate
```

### 5. Seed IELTS questions

The IELTS backend generates questions from source texts using Groq AI. Submit a few texts to get started:

```bash
# Start the IELTS backend first
cd ielts-backend && npm run dev

# Submit source texts (one per section)
curl -X POST http://localhost:3001/api/texts \
  -H "Content-Type: application/json" \
  -d '{"title":"Climate Change","content":"Global temperatures have risen by 1.1°C since pre-industrial times...","section":"Reading"}'

curl -X POST http://localhost:3001/api/texts \
  -H "Content-Type: application/json" \
  -d '{"title":"Job Interview","content":"A candidate arrives for an interview at a tech company...","section":"Listening"}'

# Add Writing and Speaking texts the same way
```

Each POST immediately triggers Groq to generate 5 questions. Check progress:

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/ielts-questions   # returns up to 80 questions
```

### 6. Start both services

```bash
# Terminal 1 — IELTS backend
cd ielts-backend && npm run dev

# Terminal 2 — Main app (includes proxy to IELTS backend)
pnpm dev
```

App is at **http://localhost:3000**. The IELTS test page at `/test/ielts` will fetch questions from the IELTS backend via the proxy.

---

## Environment Variables

### Main App (`.env`)

| Variable            | Required | Default               | Description                                          |
|---------------------|----------|-----------------------|------------------------------------------------------|
| `DATABASE_URL`      | ✅       | —                     | PostgreSQL connection string                         |
| `JWT_SECRET`        | ✅       | —                     | Secret for signing session JWTs                      |
| `IELTS_BACKEND_URL` | ✅       | `http://localhost:3001` | URL of the IELTS backend service                   |
| `DEV_USER_ID`       | Dev only | —                     | Auto-auth as this user ID on localhost (see below)   |
| `PORT`              | No       | `3000`                | Port for the main app                                |
| `VITE_APP_ID`       | Prod     | —                     | OAuth app ID                                         |
| `OAUTH_SERVER_URL`  | Prod     | —                     | OAuth server base URL                                |
| `VITE_OAUTH_PORTAL_URL` | Prod | —                    | OAuth portal URL for frontend login redirect         |

### IELTS Backend (`ielts-backend/.env`)

| Variable          | Required | Default     | Description                              |
|-------------------|----------|-------------|------------------------------------------|
| `GROQ_API_KEY`    | ✅       | —           | Groq API key (free at console.groq.com)  |
| `DB_HOST`         | No       | `localhost` | PostgreSQL host                          |
| `DB_PORT`         | No       | `5432`      | PostgreSQL port                          |
| `DB_NAME`         | No       | `ielts_db`  | PostgreSQL database name                 |
| `DB_USER`         | No       | `postgres`  | PostgreSQL user                          |
| `DB_PASSWORD`     | ✅       | —           | PostgreSQL password                      |
| `PORT`            | No       | `3001`      | Port for the IELTS backend               |
| `SCHEDULE_HOUR`   | No       | `0`         | Hour of day to run nightly generation    |
| `GENERATE_SECRET` | No       | —           | Secret for POST /api/generate endpoint   |

---

## Dev Auth Bypass (Localhost)

Set `DEV_USER_ID=1` in `.env` to skip OAuth during local development. Every request from `localhost` will be authenticated as user ID 1. Three safety guards prevent misuse:

1. `NODE_ENV !== "production"` — never active in prod
2. Request hostname must be `localhost` / `127.0.0.1`
3. Console warning printed on every request as a reminder

> ⚠️ Never set `DEV_USER_ID` in production.

---

## Database Schema (PostgreSQL)

### Main App (`language_learning` DB)

| Table              | Purpose                                              |
|--------------------|------------------------------------------------------|
| `users`            | Authenticated users (OAuth `openId`)                 |
| `lessons`          | Lesson content by category & difficulty              |
| `quiz_questions`   | Multiple-choice & fill-in-blank questions per lesson |
| `quiz_attempts`    | User quiz submission history                         |
| `user_progress`    | Completed lessons per user                           |
| `achievements`     | Badge definitions                                    |
| `user_achievements`| Earned badges                                        |
| `learning_streaks` | Daily activity streak tracking                       |
| `ielts_results`    | ← **New**: IELTS test results per user               |

### IELTS Backend (`ielts_db` DB)

| Table             | Purpose                                          |
|-------------------|--------------------------------------------------|
| `source_texts`    | Raw texts you submit; Groq reads these           |
| `ielts_questions` | AI-generated IELTS questions with batch tracking |

---

## API Reference

### tRPC (Main App — `/api/trpc`)

#### `auth`
| Procedure     | Auth   | Description              |
|---------------|--------|--------------------------|
| `auth.me`     | public | Current user or null     |
| `auth.logout` | public | Clear session cookie     |

#### `lessons`
| Procedure              | Auth   | Description                  |
|------------------------|--------|------------------------------|
| `lessons.all`          | public | All lessons                  |
| `lessons.byCategory`   | public | Filter by category           |
| `lessons.byDifficulty` | public | Filter by difficulty level   |
| `lessons.byId`         | public | Single lesson                |

#### `quiz`
| Procedure             | Auth      | Description               |
|-----------------------|-----------|---------------------------|
| `quiz.getQuestions`   | public    | Questions for a lesson    |
| `quiz.submitAttempt`  | protected | Save quiz result          |
| `quiz.getAttempts`    | protected | User's attempt history    |
| `quiz.getBestScore`   | protected | Best score for a lesson   |

#### `progress`, `achievements`, `streak`, `leaderboard`
Standard CRUD — see `server/routers.ts` for full signatures.

#### `ielts` ← **New**
| Procedure              | Auth      | Description                                        |
|------------------------|-----------|----------------------------------------------------|
| `ielts.submitResult`   | protected | Save IELTS test result to `ielts_results` table    |
| `ielts.getMyResults`   | protected | Fetch all past IELTS results for the current user  |

### IELTS Backend REST (`/api/ielts-questions` proxied via main app)

| Method | Path                        | Description                                     |
|--------|-----------------------------|-------------------------------------------------|
| GET    | `/api/ielts-questions`      | Latest 80 questions (up to 20 per skill)        |
| GET    | `/api/ielts-questions/all`  | All questions across all batches                |
| POST   | `/api/texts`                | Add source text → instantly triggers generation |
| GET    | `/api/texts`                | List all source texts and their status          |
| GET    | `/api/texts/:id`            | Single text + its generated questions           |
| DELETE | `/api/texts/:id`            | Delete text + questions                         |
| POST   | `/api/generate`             | Manually trigger generation for unprocessed texts |
| GET    | `/api/health`               | Health check                                    |

---

## IELTS Test Flow

1. User navigates to `/test/ielts`
2. **Frontend** calls `fetch("/api/ielts-questions")`
3. **Main app proxy** forwards to `IELTS_BACKEND_URL/api/ielts-questions`
4. **IELTS backend** returns up to 80 questions (20 per section) from the latest batch
5. User works through all questions with per-question timers
6. On finish: per-section scores calculated client-side
7. Result submitted via `trpc.ielts.submitResult` → stored in `ielts_results` (PostgreSQL)

Error handling: if the IELTS backend is unreachable, the page shows a clear error with a Retry button. Result submission failure is non-blocking (results shown even if DB write fails).

---

## Scripts

```bash
# Main app
pnpm dev          # dev server with hot reload
pnpm build        # production build (Vite + esbuild)
pnpm start        # run production build
pnpm check        # TypeScript type check
pnpm db:push      # generate + apply PostgreSQL migrations

# IELTS backend
cd ielts-backend
npm run dev       # nodemon dev server
npm run migrate   # create tables
npm start         # production
```

---

## Deployment Checklist

1. Set all env vars (remove `DEV_USER_ID`, set `NODE_ENV=production`)
2. Run `pnpm db:push` against your production PostgreSQL
3. Run `cd ielts-backend && npm run migrate` against the IELTS DB
4. Set `IELTS_BACKEND_URL` to the deployed IELTS backend URL
5. Deploy both services; ensure they can reach each other
6. POST at least one source text per section to `/api/texts` to seed initial questions
