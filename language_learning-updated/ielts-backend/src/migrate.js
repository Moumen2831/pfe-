const pool = require("./db");

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Running migrations...");

    // ── source_texts ──────────────────────────────────────────────────────────
    // Stores the raw texts you provide. GPT reads these to generate questions.
    await client.query(`
      CREATE TABLE IF NOT EXISTS source_texts (
        id          SERIAL PRIMARY KEY,
        title       TEXT NOT NULL,
        content     TEXT NOT NULL,
        section     TEXT NOT NULL CHECK (section IN ('Listening','Reading','Writing','Speaking')),
        processed   BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_source_texts_processed
        ON source_texts(processed);
    `);

    // ── ielts_questions ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ielts_questions (
        id                  SERIAL PRIMARY KEY,
        question_id         INTEGER NOT NULL,
        section             TEXT NOT NULL,
        text                TEXT NOT NULL,
        audio_url           TEXT,
        options             JSONB NOT NULL,
        correct_answer      TEXT NOT NULL,
        time_limit_seconds  INTEGER NOT NULL,
        question_type       TEXT NOT NULL,
        batch_id            TEXT NOT NULL,
        source_text_id      INTEGER REFERENCES source_texts(id) ON DELETE SET NULL,
        created_at          TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ielts_batch_id
        ON ielts_questions(batch_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ielts_source_text_id
        ON ielts_questions(source_text_id);
    `);

    console.log("✅ Migration complete. Tables ready.");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
