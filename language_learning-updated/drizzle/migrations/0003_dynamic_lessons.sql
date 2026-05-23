DO $$ BEGIN
  CREATE TYPE "cefr_level" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "lesson_skill" AS ENUM ('vocabulary', 'grammar', 'dialogue', 'listening', 'speaking', 'mixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "lesson_status" AS ENUM ('draft', 'published', 'archived', 'failed_validation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "lesson_progress_status" AS ENUM ('not_started', 'in_progress', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "lessons"
  ADD COLUMN IF NOT EXISTS "cefrLevel" "cefr_level",
  ADD COLUMN IF NOT EXISTS "skillFocus" "lesson_skill",
  ADD COLUMN IF NOT EXISTS "topic" varchar(100),
  ADD COLUMN IF NOT EXISTS "estimatedDurationMinutes" integer,
  ADD COLUMN IF NOT EXISTS "lessonJson" jsonb,
  ADD COLUMN IF NOT EXISTS "generationPrompt" text,
  ADD COLUMN IF NOT EXISTS "generatedBy" varchar(100),
  ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "status" "lesson_status" NOT NULL DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS "lesson_cefr_idx" ON "lessons" ("cefrLevel");
CREATE INDEX IF NOT EXISTS "lesson_skill_idx" ON "lessons" ("skillFocus");
CREATE INDEX IF NOT EXISTS "lesson_status_idx" ON "lessons" ("status");

ALTER TABLE "user_progress"
  ADD COLUMN IF NOT EXISTS "status" "lesson_progress_status" NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS "completionPercentage" numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "score" numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "vocabularyScore" numeric(5,2),
  ADD COLUMN IF NOT EXISTS "grammarScore" numeric(5,2),
  ADD COLUMN IF NOT EXISTS "listeningScore" numeric(5,2),
  ADD COLUMN IF NOT EXISTS "speakingScore" numeric(5,2),
  ADD COLUMN IF NOT EXISTS "quizScore" numeric(5,2),
  ADD COLUMN IF NOT EXISTS "startedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamp NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS "user_lesson_unique_idx" ON "user_progress" ("userId", "lessonId");

CREATE TABLE IF NOT EXISTS "lesson_attempts" (
  "id" serial PRIMARY KEY,
  "userId" integer NOT NULL,
  "lessonId" integer NOT NULL,
  "blockId" varchar(100) NOT NULL,
  "blockType" varchar(50) NOT NULL,
  "userAnswer" jsonb,
  "aiFeedback" jsonb,
  "score" numeric(5,2),
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "lesson_attempt_user_lesson_block_idx"
  ON "lesson_attempts" ("userId", "lessonId", "blockId");

CREATE TABLE IF NOT EXISTS "speaking_attempts" (
  "id" serial PRIMARY KEY,
  "userId" integer NOT NULL,
  "lessonId" integer NOT NULL,
  "speakingTaskId" varchar(100) NOT NULL,
  "audioUrl" text,
  "transcript" text,
  "targetText" text NOT NULL,
  "pronunciationScore" numeric(5,2),
  "fluencyScore" numeric(5,2),
  "accuracyScore" numeric(5,2),
  "whisperResult" jsonb,
  "speechbrainResult" jsonb,
  "llamaFeedback" jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "speaking_attempt_user_lesson_idx"
  ON "speaking_attempts" ("userId", "lessonId");

CREATE TABLE IF NOT EXISTS "recommendations" (
  "id" serial PRIMARY KEY,
  "userId" integer NOT NULL,
  "lessonId" integer NOT NULL,
  "reason" text NOT NULL,
  "priority" integer NOT NULL DEFAULT 1,
  "recommendationType" varchar(50) NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "recommendation_user_idx" ON "recommendations" ("userId");
CREATE INDEX IF NOT EXISTS "recommendation_priority_idx" ON "recommendations" ("userId", "priority");
