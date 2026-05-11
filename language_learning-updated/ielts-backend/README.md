# IELTS Backend API

Node.js + Express + PostgreSQL backend.
Uses **Google Gemini (free)** to generate IELTS questions from your source texts.

---

## Quick Start

### 1. Get your free Gemini API key
Go to https://aistudio.google.com → Sign in → "Get API Key" → Create key.
No credit card needed.

### 2. Install dependencies
```
npm install
```

### 3. Configure environment
```
cp .env.example .env
```
Open .env and set:
- GEMINI_API_KEY = your key from step 1
- DB_PASSWORD = your PostgreSQL password

### 4. Create the database
```
psql -U postgres -c "CREATE DATABASE ielts_db;"
```

### 5. Run migrations
```
npm run migrate
```

### 6. Start the server
```
npm start
```

---

## Adding Source Texts

POST a text and Gemini instantly generates 5 questions from it:

```
curl -X POST http://localhost:3001/api/texts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "The Water Cycle",
    "content": "Water evaporates from oceans due to solar energy. This vapor rises, cools, and forms clouds. Eventually it falls as rain or snow, completing the cycle.",
    "section": "Reading"
  }'
```

section must be one of: Listening, Reading, Writing, Speaking

---

## API Endpoints

POST   /api/texts                  submit text, triggers instant generation
GET    /api/texts                  list all source texts
GET    /api/texts/:id              get text + its questions
DELETE /api/texts/:id              delete text + its questions

GET    /api/ielts-questions        latest questions (frontend uses this)
GET    /api/ielts-questions/all    all questions ever generated

POST   /api/generate               manually trigger generation (header: x-generate-secret)
GET    /api/health                 health check

---

## Frontend

In IeltsTestPage.tsx:
```
const QUESTIONS_API_URL = "http://localhost:3001/api/ielts-questions";
```
