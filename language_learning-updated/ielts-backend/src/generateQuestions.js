const Groq = require("groq-sdk");
const pool = require("./db");
require("dotenv").config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// llama-3.3-70b-versatile: free, fast, excellent for structured JSON output
const MODEL = "llama-3.3-70b-versatile";

const QUESTIONS_PER_TEXT = 5;

// ─── Section config ───────────────────────────────────────────────────────────

const SECTION_CONFIG = {
  Listening: { questionType: "listening", timeLimitSeconds: 45 },
  Reading:   { questionType: "reading",   timeLimitSeconds: 60 },
  Writing:   { questionType: "writing",   timeLimitSeconds: 120 },
  Speaking:  { questionType: "speaking",  timeLimitSeconds: 90 },
};

// ─── Build prompt ─────────────────────────────────────────────────────────────

function buildPrompt(section, title, content) {
  const isTextResponse = section === "Writing" || section === "Speaking";

  if (isTextResponse) {
    return `Based ONLY on the following source text, generate exactly ${QUESTIONS_PER_TEXT} IELTS ${section} task prompts.

Source Title: "${title}"
Source Text:
"""
${content}
"""

Rules:
- Every task must directly relate to the source text above.
- The "text" field is the full task instruction for the student.
- Set options to ["Text input required", "", "", ""] for all tasks.
- Set correctAnswer to "text" for all tasks.
- Do NOT invent topics unrelated to the source text.

Respond with ONLY a valid JSON array. No explanation, no markdown. Start with [ and end with ].

Example:
[
  {
    "text": "task instruction referencing the source text...",
    "options": ["Text input required", "", "", ""],
    "correctAnswer": "text"
  }
]`;
  }

  return `Based ONLY on the following source text, generate exactly ${QUESTIONS_PER_TEXT} IELTS ${section} multiple-choice questions.

Source Title: "${title}"
Source Text:
"""
${content}
"""

Rules:
- Every question must be directly answerable from the source text above.
- Provide exactly 4 answer options as plain strings (not labelled A/B/C/D — just the text).
- correctAnswer must be exactly one of: "A", "B", "C", or "D".
- Do NOT invent facts not present in the source text.

Respond with ONLY a valid JSON array. No explanation, no markdown. Start with [ and end with ].

Example:
[
  {
    "text": "question based on the source text...",
    "options": ["option one", "option two", "option three", "option four"],
    "correctAnswer": "B"
  }
]`;
}

// ─── Call Groq ────────────────────────────────────────────────────────────────

async function askGroq(prompt) {
  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are an expert IELTS question generator. Always respond with a valid JSON array only. No prose, no markdown fences, no extra text whatsoever.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 3000,
  });

  const raw = completion.choices[0].message.content.trim();

  // Strip markdown fences just in case
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Extract JSON array
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) {
    console.error("  ✗ Could not find JSON array in Groq response.");
    console.error("  Raw response:", raw.slice(0, 400));
    throw new Error("Groq did not return a JSON array.");
  }

  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) throw new Error("Parsed value is not an array");
    return parsed;
  } catch (err) {
    console.error("  ✗ JSON parse error:", err.message);
    console.error("  Cleaned response:", cleaned.slice(0, 400));
    throw new Error("Groq returned invalid JSON.");
  }
}

// ─── Generate & store questions for one source text ───────────────────────────

async function generateForText(sourceText, batchId, questionIdOffset) {
  const { id, title, content, section } = sourceText;
  const config = SECTION_CONFIG[section];

  console.log(`  📄 [source_text #${id}] "${title}" (${section})`);

  const prompt = buildPrompt(section, title, content);
  const rawQuestions = await askGroq(prompt);
  const trimmed = rawQuestions.slice(0, QUESTIONS_PER_TEXT);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (let i = 0; i < trimmed.length; i++) {
      const q = trimmed[i];
      await client.query(
        `INSERT INTO ielts_questions
           (question_id, section, text, audio_url, options, correct_answer,
            time_limit_seconds, question_type, batch_id, source_text_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          questionIdOffset + i + 1,
          section,
          q.text,
          null,
          JSON.stringify(q.options),
          q.correctAnswer,
          config.timeLimitSeconds,
          config.questionType,
          batchId,
          id,
        ]
      );
    }

    // Mark text as processed
    await client.query(
      `UPDATE source_texts SET processed = TRUE WHERE id = $1`,
      [id]
    );

    await client.query("COMMIT");
    console.log(`  ✓ ${trimmed.length} questions saved for source_text #${id}.`);
    return trimmed.length;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Process all unprocessed texts ───────────────────────────────────────────

async function generateFromUnprocessedTexts() {
  const { rows: unprocessed } = await pool.query(
    `SELECT * FROM source_texts WHERE processed = FALSE ORDER BY created_at ASC`
  );

  if (unprocessed.length === 0) {
    console.log("ℹ️  No unprocessed source texts found.");
    return 0;
  }

  console.log(`\n🚀 Found ${unprocessed.length} unprocessed text(s). Generating questions...\n`);

  const batchId = `batch_${Date.now()}`;
  let totalGenerated = 0;
  let questionIdOffset = 0;

  for (const sourceText of unprocessed) {
    try {
      const count = await generateForText(sourceText, batchId, questionIdOffset);
      questionIdOffset += count;
      totalGenerated += count;
    } catch (err) {
      console.error(`  ✗ Failed for source_text #${sourceText.id}:`, err.message);
    }
  }

  console.log(`\n✅ Done. ${totalGenerated} questions generated (batch: ${batchId})\n`);
  return totalGenerated;
}

// ─── Generate for a single text by ID (instant trigger on POST /api/texts) ───

async function generateForTextById(sourceTextId, batchId) {
  const { rows } = await pool.query(
    `SELECT * FROM source_texts WHERE id = $1`,
    [sourceTextId]
  );
  if (rows.length === 0) throw new Error(`Source text #${sourceTextId} not found`);

  const { rows: offsetRows } = await pool.query(
    `SELECT COALESCE(MAX(question_id), 0) AS max_id FROM ielts_questions WHERE batch_id = $1`,
    [batchId]
  );
  const offset = parseInt(offsetRows[0].max_id);

  return generateForText(rows[0], batchId, offset);
}

module.exports = { generateFromUnprocessedTexts, generateForTextById };
