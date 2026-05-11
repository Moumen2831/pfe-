const express = require("express");
const cors = require("cors");
const path = require("path");
const pool = require("./db");
const { generateFromUnprocessedTexts, generateForTextById } = require("./generateQuestions");
const { startScheduler, stopScheduler } = require("./scheduler");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Admin UI ──────────────────────────────────────────────────────────────────
app.use("/admin", express.static(path.join(__dirname, "public")));
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function rowToQuestion(row, index) {
  return {
    questionId: index + 1,
    section: row.section,
    text: row.text,
    audioUrl: row.audio_url || undefined,
    options: Array.isArray(row.options) ? row.options : JSON.parse(row.options),
    correctAnswer: row.correct_answer,
    timeLimitSeconds: row.time_limit_seconds,
    questionType: row.question_type,
    niveau: row.niveau || null,
    sourceTextId: row.source_text_id || null,
    sourceTitle: row.source_title || undefined,
    sourceContent: row.source_content || undefined,
    sourceAudioUrl: row.source_audio_url || undefined,
  };
}

// Track in-progress generation to avoid parallel runs
let generationInProgress = false;

// ═══════════════════════════════════════════════════════════════════════════════
//  SOURCE TEXTS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/texts
// Body: { title, content, section, audioUrl? }
// audioUrl is saved directly in source_texts.audio_url
app.post("/api/texts", async (req, res) => {
  const { title, content, section, audioUrl } = req.body;

  const validSections = ["Listening", "Reading", "Writing", "Speaking"];
  if (!title || !content || !section) {
    return res.status(400).json({ error: "title, content, and section are required." });
  }
  if (!validSections.includes(section)) {
    return res.status(400).json({
      error: `section must be one of: ${validSections.join(", ")}`,
    });
  }

  let newText;
  try {
    const { rows } = await pool.query(
      `INSERT INTO source_texts (title, content, section, audio_url)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [title, content, section, audioUrl || null]
    );
    newText = rows[0];
  } catch (err) {
    console.error("POST /api/texts DB error:", err.message);
    return res.status(500).json({ error: "Failed to save source text." });
  }

  res.status(201).json({
    message: `Text saved. Generating questions (with CEFR niveau) in the background...`,
    sourceText: newText,
  });

  if (!generationInProgress) {
    generationInProgress = true;
    const batchId = `batch_${Date.now()}`;
    generateForTextById(newText.id, batchId)
      .then(async (count) => {
        console.log(`✅ Instant generation done: ${count} questions for source_text #${newText.id}`);
        if (newText.audio_url) {
          await pool.query(
            `UPDATE ielts_questions SET audio_url = $1 WHERE source_text_id = $2`,
            [newText.audio_url, newText.id]
          );
          console.log(`🎵 Audio URL propagated to questions for source_text #${newText.id}`);
        }
      })
      .catch((err) => {
        console.error(`✗ Instant generation failed for source_text #${newText.id}:`, err.message);
      })
      .finally(() => {
        generationInProgress = false;
      });
  } else {
    console.log("⚠️  Generation already in progress — this text will be picked up by the scheduler.");
  }
});

// GET /api/texts
app.get("/api/texts", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         s.id, s.title, s.section, s.audio_url, s.processed, s.created_at,
         COUNT(q.id)::int AS question_count,
         json_agg(json_build_object('niveau', q.niveau) ORDER BY q.id)
           FILTER (WHERE q.id IS NOT NULL) AS niveaux
       FROM source_texts s
       LEFT JOIN ielts_questions q ON q.source_text_id = s.id
       GROUP BY s.id
       ORDER BY s.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /api/texts error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/texts/:id
app.get("/api/texts/:id", async (req, res) => {
  try {
    const { rows: textRows } = await pool.query(
      `SELECT * FROM source_texts WHERE id = $1`,
      [req.params.id]
    );
    if (textRows.length === 0) {
      return res.status(404).json({ error: "Source text not found." });
    }

    const { rows: questionRows } = await pool.query(
      `SELECT * FROM ielts_questions WHERE source_text_id = $1 ORDER BY id`,
      [req.params.id]
    );

    const byNiveau = {};
    questionRows.forEach((row) => {
      const n = row.niveau || "unclassified";
      if (!byNiveau[n]) byNiveau[n] = [];
      byNiveau[n].push(rowToQuestion(row, byNiveau[n].length));
    });

    res.json({
      sourceText: textRows[0],
      questions: questionRows.map(rowToQuestion),
      questionsByNiveau: byNiveau,
    });
  } catch (err) {
    console.error("GET /api/texts/:id error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/texts/:id
app.delete("/api/texts/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM source_texts WHERE id = $1`,
      [req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Source text not found." });
    res.json({ message: "Source text and its questions deleted." });
  } catch (err) {
    console.error("DELETE /api/texts/:id error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  QUESTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/ielts-questions
//
// Returns up to 60 questions per call:
//   Listening : 5 per source text (one per CEFR level A1→C2), hard cap 20 total
//   Reading   : 5 per source text (one per CEFR level A1→C2), hard cap 20 total
//   Writing   : 10 random
//   Speaking  : 10 random
//
// Every call returns a different random set because source texts are shuffled
// and Writing/Speaking use ORDER BY RANDOM().
//
// Optional filters: ?niveau=B1  |  ?source_text_id=3
app.get("/api/ielts-questions", async (req, res) => {
  try {
    const niveauFilter = req.query.niveau;
    const textFilter   = req.query.source_text_id;

    const validNiveaux = ["A1", "A2", "B1", "B2", "C1", "C2"];
    if (niveauFilter && !validNiveaux.includes(niveauFilter)) {
      return res.status(400).json({ error: `niveau must be one of: ${validNiveaux.join(", ")}` });
    }

    const { rows: countRows } = await pool.query(`SELECT COUNT(*) FROM ielts_questions`);
    if (parseInt(countRows[0].count) === 0) {
      return res.status(404).json({
        error: "No questions yet. POST source texts to /api/texts to generate them.",
      });
    }

    const conditions = [];
    const params = [];
    if (niveauFilter) {
      params.push(niveauFilter);
      conditions.push(`q.niveau = $${params.length}`);
    }
    if (textFilter) {
      params.push(parseInt(textFilter));
      conditions.push(`q.source_text_id = $${params.length}`);
    }
    const extraWhere = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

    const NIVEAUX_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];
    const niveauRank = (n) => ({ A1:1, A2:2, B1:3, B2:4, C1:5, C2:6 }[n] ?? 7);

    // pickFivePerSourceText(rows, maxTotal)
    //
    // Pass 1 — for each source text pick one random question per CEFR level
    //          (max 5 per source), add them individually up to maxTotal.
    //          Source texts are shuffled so rotation is random across calls.
    // Pass 2 — if we still haven't reached maxTotal, fill remaining slots with
    //          any leftover questions (random order) that weren't already picked.
    //          This guarantees we always return exactly maxTotal questions as
    //          long as the pool is large enough.
    function pickFivePerSourceText(rows, maxTotal) {
      if (rows.length === 0) return [];

      // Build: sourceId -> { niveau -> [row, ...] }
      const bySource = {};
      for (const row of rows) {
        const sid = String(row.source_text_id ?? "__none__");
        if (!bySource[sid]) bySource[sid] = {};
        const lvl = row.niveau || "unclassified";
        if (!bySource[sid][lvl]) bySource[sid][lvl] = [];
        bySource[sid][lvl].push(row);
      }

      // Shuffle source IDs for randomness across calls
      const sourceIds = Object.keys(bySource).sort(() => Math.random() - 0.5);

      const pickedIds = new Set();
      const picked = [];

      // Pass 1: up to 5 questions per source text, one per CEFR level
      for (const sid of sourceIds) {
        if (picked.length >= maxTotal) break;
        for (const lvl of NIVEAUX_ORDER) {
          if (picked.length >= maxTotal) break;
          const candidates = bySource[sid][lvl];
          if (!candidates || candidates.length === 0) continue;
          const chosen = candidates[Math.floor(Math.random() * candidates.length)];
          if (!pickedIds.has(chosen.id)) {
            pickedIds.add(chosen.id);
            picked.push(chosen);
          }
        }
      }

      // Pass 2: fill remaining slots with any unused questions (random order)
      if (picked.length < maxTotal) {
        const leftover = rows
          .filter(r => !pickedIds.has(r.id))
          .sort(() => Math.random() - 0.5);
        for (const row of leftover) {
          if (picked.length >= maxTotal) break;
          picked.push(row);
        }
      }

      // Sort final selection A1 → C2
      picked.sort((a, b) => niveauRank(a.niveau) - niveauRank(b.niveau));
      return picked;
    }

    // ── Fetch all Listening questions then cap at 20 ──────────────────────────
    const { rows: listeningRows } = await pool.query(
      `SELECT q.*, s.title AS source_title, s.content AS source_content,
              s.audio_url AS source_audio_url
       FROM ielts_questions q
       LEFT JOIN source_texts s ON s.id = q.source_text_id
       WHERE q.question_type = 'listening' ${extraWhere}`,
      params
    );
    const listeningPicked = pickFivePerSourceText(listeningRows, 20);

    // ── Fetch all Reading questions then cap at 20 ────────────────────────────
    const { rows: readingRows } = await pool.query(
      `SELECT q.*, s.title AS source_title, s.content AS source_content,
              s.audio_url AS source_audio_url
       FROM ielts_questions q
       LEFT JOIN source_texts s ON s.id = q.source_text_id
       WHERE q.question_type = 'reading' ${extraWhere}`,
      params
    );
    const readingPicked = pickFivePerSourceText(readingRows, 20);

    // ── Writing: 10 random ───────────────────────────────────────────────────
    const { rows: writingRows } = await pool.query(
      `SELECT q.*, s.title AS source_title, s.content AS source_content,
              s.audio_url AS source_audio_url
       FROM ielts_questions q
       LEFT JOIN source_texts s ON s.id = q.source_text_id
       WHERE q.question_type = 'writing' ${extraWhere}
       ORDER BY RANDOM()
       LIMIT 10`,
      params
    );

    // ── Speaking: 10 random ──────────────────────────────────────────────────
    const { rows: speakingRows } = await pool.query(
      `SELECT q.*, s.title AS source_title, s.content AS source_content,
              s.audio_url AS source_audio_url
       FROM ielts_questions q
       LEFT JOIN source_texts s ON s.id = q.source_text_id
       WHERE q.question_type = 'speaking' ${extraWhere}
       ORDER BY RANDOM()
       LIMIT 10`,
      params
    );

    // ── Combine: Listening → Reading → Writing → Speaking ────────────────────
    const all = [
      ...listeningPicked,
      ...readingPicked,
      ...writingRows,
      ...speakingRows,
    ];

    res.json(all.map(rowToQuestion));
  } catch (err) {
    console.error("GET /api/ielts-questions error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/ielts-questions/all
// Returns ALL questions, joined with source text title, content and audio URL.
// Supports optional ?niveau=B1 and ?source_text_id=3 filters.
app.get("/api/ielts-questions/all", async (req, res) => {
  try {
    const niveauFilter = req.query.niveau;
    const textFilter   = req.query.source_text_id;

    const validNiveaux = ["A1", "A2", "B1", "B2", "C1", "C2"];
    if (niveauFilter && !validNiveaux.includes(niveauFilter)) {
      return res.status(400).json({ error: `niveau must be one of: ${validNiveaux.join(", ")}` });
    }

    const conditions = [];
    const params = [];
    if (niveauFilter) {
      params.push(niveauFilter);
      conditions.push(`q.niveau = $${params.length}`);
    }
    if (textFilter) {
      params.push(parseInt(textFilter));
      conditions.push(`q.source_text_id = $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT q.*, s.title AS source_title, s.content AS source_content,
              s.audio_url AS source_audio_url
       FROM ielts_questions q
       LEFT JOIN source_texts s ON s.id = q.source_text_id
       ${whereClause}
       ORDER BY
         CASE q.niveau
           WHEN 'A1' THEN 1 WHEN 'A2' THEN 2 WHEN 'B1' THEN 3
           WHEN 'B2' THEN 4 WHEN 'C1' THEN 5 WHEN 'C2' THEN 6
           ELSE 7
         END,
         q.created_at DESC, q.id`,
      params
    );
    res.json(rows.map(rowToQuestion));
  } catch (err) {
    console.error("GET /api/ielts-questions/all error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/ielts-questions/by-niveau
// Returns a summary grouped by CEFR niveau across all questions
app.get("/api/ielts-questions/by-niveau", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COALESCE(q.niveau, 'unclassified') AS niveau,
         COUNT(*)::int AS total,
         json_agg(
           json_build_object(
             'id',            q.id,
             'text',          q.text,
             'section',       q.section,
             'questionType',  q.question_type,
             'sourceTextId',  q.source_text_id,
             'sourceTitle',   s.title,
             'sourceAudioUrl',s.audio_url
           )
           ORDER BY q.id
         ) AS questions
       FROM ielts_questions q
       LEFT JOIN source_texts s ON s.id = q.source_text_id
       GROUP BY COALESCE(q.niveau, 'unclassified')
       ORDER BY
         CASE COALESCE(q.niveau, 'unclassified')
           WHEN 'A1' THEN 1 WHEN 'A2' THEN 2 WHEN 'B1' THEN 3
           WHEN 'B2' THEN 4 WHEN 'C1' THEN 5 WHEN 'C2' THEN 6
           ELSE 7
         END`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /api/ielts-questions/by-niveau error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  MANUAL GENERATION TRIGGER
// ═══════════════════════════════════════════════════════════════════════════════

app.post("/api/generate", async (req, res) => {
  const secret = req.headers["x-generate-secret"];
  if (process.env.GENERATE_SECRET && secret !== process.env.GENERATE_SECRET) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  if (generationInProgress) {
    return res.status(409).json({ error: "Generation already in progress." });
  }

  res.json({ message: "Generation started for all unprocessed texts. Check server logs." });

  generationInProgress = true;
  generateFromUnprocessedTexts()
    .then((count) => console.log(`✅ Manual trigger complete: ${count} questions generated.`))
    .catch((err) => console.error("✗ Manual trigger failed:", err.message))
    .finally(() => { generationInProgress = false; });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  HEALTH
// ═══════════════════════════════════════════════════════════════════════════════

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected", generationInProgress, schedulerActive: true });
  } catch {
    res.status(500).json({ status: "error", db: "disconnected" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════════════════════════════

const server = app.listen(PORT, () => {
  console.log(`\n🎓 IELTS Backend running on http://localhost:${PORT}`);
  console.log(`
  Source Texts:
    POST   /api/texts                       → submit text (+audioUrl) → saves audio_url in source_texts
    GET    /api/texts                       → list all source texts + question counts per niveau
    GET    /api/texts/:id                   → get text + its questions (flat + grouped by niveau)
    DELETE /api/texts/:id                   → delete text + its questions

  Questions:
    GET    /api/ielts-questions             → up to 60 questions (L:5/text≤20, R:5/text≤20, W:10, S:10)
           ?niveau=B1                       → filter by CEFR level (A1/A2/B1/B2/C1/C2)
           ?source_text_id=3               → filter by originating text
    GET    /api/ielts-questions/all         → all questions ever generated
    GET    /api/ielts-questions/by-niveau   → questions grouped by CEFR niveau

  Admin:
    POST   /api/generate                    → manually trigger generation (needs x-generate-secret header)
    GET    /api/health                      → health check
  `);
  startScheduler();
});

process.on("SIGTERM", () => {
  stopScheduler();
  server.close(() => {
    pool.end();
    console.log("Server shut down.");
  });
});