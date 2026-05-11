-- Migration: 0002_add_ielts_feedback
-- Stores LLaMA + SpeechBrain evaluation feedback for each IELTS test attempt.
-- One row per skill (Writing / Speaking) per test session.

CREATE TABLE IF NOT EXISTS "ielts_feedback" (
  "id"              serial PRIMARY KEY,
  "userId"          integer        NOT NULL,
  "ieltsResultId"   integer        REFERENCES "ielts_results"("id") ON DELETE SET NULL,
  "skill"           varchar(50)    NOT NULL,          -- 'Writing' | 'Speaking'
  "source"          varchar(50)    NOT NULL,          -- 'llama' | 'speechbrain' | 'combined'
  "overallBand"     numeric(4,2),                    -- e.g. 6.50
  "overallFeedback" text,                            -- 4-5 sentence holistic feedback
  "perQuestion"     text,                            -- JSON array of per-question scores + feedback
  "createdAt"       timestamp      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ielts_feedback_user_idx"   ON "ielts_feedback" ("userId");
CREATE INDEX IF NOT EXISTS "ielts_feedback_result_idx" ON "ielts_feedback" ("ieltsResultId");
CREATE INDEX IF NOT EXISTS "ielts_feedback_skill_idx"  ON "ielts_feedback" ("userId", "skill");
