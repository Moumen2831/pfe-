import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  InsertUser,
  users,
  lessons,
  quizQuestions,
  userProgress,
  quizAttempts,
  achievements,
  userAchievements,
  learningStreaks,
  ieltsResults,
  InsertIeltsResult,
  lessonAttempts,
  recommendations,
  speakingAttempts,
} from "../drizzle/schema";
import type { DynamicLessonSchema } from "./modules/lessons/lesson.schema";
import { mapCefrToDifficulty } from "./modules/lessons/lesson.service";
import { ENV } from "./_core/env";

// ── DB connection (lazy, singleton) ─────────────────────────────────────────
let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;
let _dynamicLessonSchemaReady = false;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = new Pool({ connectionString: process.env.DATABASE_URL });
      _db   = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function ensureDynamicLessonSchema() {
  if (_dynamicLessonSchemaReady || !_pool) return;

  await _pool.query(`
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
  `);

  _dynamicLessonSchemaReady = true;
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field]    = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn    = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role    = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role    = "admin";
      updateSet.role = "admin";
    }

    await db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({ target: users.openId, set: updateSet });
  } catch (error) {
    console.warn("[Database] upsertUser failed:", error);
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0] ?? null;
}

// ── Lessons ──────────────────────────────────────────────────────────────────

export async function getAllLessons() {
  const db = await getDb();
  if (!db) return [];
  await ensureDynamicLessonSchema();
  return db.select().from(lessons).orderBy(lessons.order);
}

export async function getLessonsByCategory(category: string) {
  const db = await getDb();
  if (!db) return [];
  await ensureDynamicLessonSchema();
  return db.select().from(lessons).where(eq(lessons.category, category)).orderBy(lessons.order);
}

export async function getLessonsByDifficulty(difficulty: "Beginner" | "Intermediate" | "Advanced") {
  const db = await getDb();
  if (!db) return [];
  await ensureDynamicLessonSchema();
  return db.select().from(lessons).where(eq(lessons.difficulty, difficulty)).orderBy(lessons.order);
}

export async function getLessonById(id: number) {
  const db = await getDb();
  if (!db) return null;
  await ensureDynamicLessonSchema();
  const result = await db.select().from(lessons).where(eq(lessons.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createDynamicLesson(data: {
  lesson: DynamicLessonSchema;
  generationPrompt: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  await ensureDynamicLessonSchema();

  const { lesson } = data;
  const result = await db
    .insert(lessons)
    .values({
      title: lesson.title,
      description: lesson.description,
      category: lesson.topic,
      difficulty: mapCefrToDifficulty(lesson.cefrLevel),
      content: lesson.description,
      examples: JSON.stringify(
        lesson.blocks
          .filter(block => block.type === "vocabulary")
          .flatMap(block => "items" in block && Array.isArray(block.items) ? block.items : [])
          .map((item: any) => ({ text: item.word, translation: item.definition }))
      ),
      cefrLevel: lesson.cefrLevel,
      skillFocus: lesson.skillFocus,
      topic: lesson.topic,
      estimatedDurationMinutes: lesson.estimatedDurationMinutes,
      lessonJson: lesson,
      generationPrompt: data.generationPrompt,
      generatedBy: lesson.metadata.generatedBy || "llama-3",
      version: lesson.metadata.version,
      status: "draft",
    })
    .returning();

  return result[0] ?? null;
}

export async function publishLesson(id: number) {
  const db = await getDb();
  if (!db) return null;
  await ensureDynamicLessonSchema();
  const result = await db
    .update(lessons)
    .set({ status: "published", updatedAt: new Date() })
    .where(eq(lessons.id, id))
    .returning();
  return result[0] ?? null;
}

// ── Quiz Questions ────────────────────────────────────────────────────────────

export async function getQuizQuestionsByLesson(lessonId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.lessonId, lessonId))
    .orderBy(quizQuestions.order);
}

// ── Quiz Attempts ─────────────────────────────────────────────────────────────

export async function recordQuizAttempt(
  userId: number,
  lessonId: number,
  score: number,
  totalQuestions: number,
  correctAnswers: number,
  answers: unknown[]
) {
  const db = await getDb();
  if (!db) return;

  const existing = await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.lessonId, lessonId)));

  const attemptNumber = existing.length + 1;

  await db.insert(quizAttempts).values({
    userId,
    lessonId,
    score: score.toString(),
    totalQuestions,
    correctAnswers,
    answers: JSON.stringify(answers),
    attemptNumber,
  });
}

export async function getUserQuizAttempts(userId: number, lessonId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.lessonId, lessonId)))
    .orderBy(desc(quizAttempts.completedAt));
}

export async function getAllUserQuizAttempts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(quizAttempts)
    .where(eq(quizAttempts.userId, userId))
    .orderBy(desc(quizAttempts.completedAt));
}

export async function getUserBestScore(userId: number, lessonId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.lessonId, lessonId)))
    .orderBy(desc(quizAttempts.score))
    .limit(1);
  return result[0] ?? null;
}

// ── User Progress ─────────────────────────────────────────────────────────────

export async function markLessonComplete(userId: number, lessonId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(userProgress)
    .values({ userId, lessonId, completed: true, completedAt: new Date() })
    .onConflictDoNothing();
}

export async function getUserCompletedLessons(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(userProgress)
    .where(and(eq(userProgress.userId, userId), eq(userProgress.completed, true)));
}

export async function getUserProgress(userId: number, lessonId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(userProgress)
    .where(and(eq(userProgress.userId, userId), eq(userProgress.lessonId, lessonId)))
    .limit(1);
  return result[0] ?? null;
}

export async function updateLessonProgress(
  userId: number,
  lessonId: number,
  data: {
    status?: "not_started" | "in_progress" | "completed";
    completionPercentage?: number;
    score?: number;
    vocabularyScore?: number;
    grammarScore?: number;
    listeningScore?: number;
    speakingScore?: number;
    quizScore?: number;
  }
) {
  const db = await getDb();
  if (!db) return null;
  await ensureDynamicLessonSchema();

  const status = data.status ?? "in_progress";
  const completed = status === "completed" || (data.completionPercentage ?? 0) >= 100;
  const now = new Date();

  const values = {
    userId,
    lessonId,
    completed,
    status: completed ? "completed" as const : status,
    completionPercentage: String(data.completionPercentage ?? (completed ? 100 : 0)),
    score: String(data.score ?? 0),
    vocabularyScore: data.vocabularyScore == null ? null : String(data.vocabularyScore),
    grammarScore: data.grammarScore == null ? null : String(data.grammarScore),
    listeningScore: data.listeningScore == null ? null : String(data.listeningScore),
    speakingScore: data.speakingScore == null ? null : String(data.speakingScore),
    quizScore: data.quizScore == null ? null : String(data.quizScore),
    startedAt: now,
    completedAt: completed ? now : null,
    updatedAt: now,
  };

  const existing = await db
    .select()
    .from(userProgress)
    .where(and(eq(userProgress.userId, userId), eq(userProgress.lessonId, lessonId)))
    .limit(1);

  if (existing[0]) {
    const result = await db
      .update(userProgress)
      .set({
        completed: values.completed,
        status: values.status,
        completionPercentage: values.completionPercentage,
        score: values.score,
        vocabularyScore: values.vocabularyScore,
        grammarScore: values.grammarScore,
        listeningScore: values.listeningScore,
        speakingScore: values.speakingScore,
        quizScore: values.quizScore,
        completedAt: values.completedAt,
        updatedAt: now,
      })
      .where(eq(userProgress.id, existing[0].id))
      .returning();

    return result[0] ?? null;
  }

  const result = await db
    .insert(userProgress)
    .values(values)
    .returning();

  return result[0] ?? null;
}

export async function recordLessonAttempt(data: {
  userId: number;
  lessonId: number;
  blockId: string;
  blockType: string;
  userAnswer?: unknown;
  aiFeedback?: unknown;
  score?: number;
}) {
  const db = await getDb();
  if (!db) return null;
  await ensureDynamicLessonSchema();

  const result = await db
    .insert(lessonAttempts)
    .values({
      userId: data.userId,
      lessonId: data.lessonId,
      blockId: data.blockId,
      blockType: data.blockType,
      userAnswer: data.userAnswer ?? null,
      aiFeedback: data.aiFeedback ?? null,
      score: data.score == null ? null : String(data.score),
    })
    .returning();

  return result[0] ?? null;
}

export async function recordSpeakingAttempt(data: {
  userId: number;
  lessonId: number;
  speakingTaskId: string;
  audioUrl?: string;
  transcript: string;
  targetText: string;
  pronunciationScore: number;
  fluencyScore: number;
  accuracyScore: number;
  whisperResult?: unknown;
  speechbrainResult?: unknown;
  llamaFeedback?: unknown;
}) {
  const db = await getDb();
  if (!db) return null;
  await ensureDynamicLessonSchema();

  const result = await db
    .insert(speakingAttempts)
    .values({
      userId: data.userId,
      lessonId: data.lessonId,
      speakingTaskId: data.speakingTaskId,
      audioUrl: data.audioUrl ?? null,
      transcript: data.transcript,
      targetText: data.targetText,
      pronunciationScore: String(data.pronunciationScore),
      fluencyScore: String(data.fluencyScore),
      accuracyScore: String(data.accuracyScore),
      whisperResult: data.whisperResult ?? null,
      speechbrainResult: data.speechbrainResult ?? null,
      llamaFeedback: data.llamaFeedback ?? null,
    })
    .returning();

  return result[0] ?? null;
}

export async function getLessonRecommendations(userId: number) {
  const db = await getDb();
  if (!db) return [];
  await ensureDynamicLessonSchema();

  const progressRows = await db.select().from(userProgress).where(eq(userProgress.userId, userId));
  const completedLessonIds = new Set(progressRows.filter(row => row.completed).map(row => row.lessonId));
  const weakSkills = new Set<string>(detectWeakSkills(progressRows));
  const candidateLessons = await db.select().from(lessons).orderBy(lessons.order);

  return candidateLessons
    .filter(lesson => !completedLessonIds.has(lesson.id))
    .map(lesson => {
      const skill = lesson.skillFocus ?? "mixed";
      const isWeakSkill = weakSkills.has(skill);
      return {
        lessonId: lesson.id,
        title: lesson.title,
        cefrLevel: lesson.cefrLevel,
        skillFocus: lesson.skillFocus,
        topic: lesson.topic ?? lesson.category,
        priority: isWeakSkill ? 10 : lesson.skillFocus === "mixed" ? 7 : 5,
        recommendationType: isWeakSkill ? "weakness_practice" : "next_lesson",
        reason: isWeakSkill
          ? `Recommended because your recent ${skill} scores need more practice.`
          : "Recommended as a suitable next lesson for your learning path.",
      };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6);
}

function detectWeakSkills(progressRows: Array<typeof userProgress.$inferSelect>) {
  const scoreFields = [
    ["vocabulary", "vocabularyScore"],
    ["grammar", "grammarScore"],
    ["listening", "listeningScore"],
    ["speaking", "speakingScore"],
    ["quiz", "quizScore"],
  ] as const;

  return scoreFields
    .filter(([, field]) => {
      const scores = progressRows
        .map(row => row[field])
        .filter((score): score is string => score != null)
        .map(Number);

      if (scores.length === 0) return false;
      const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      return average < 70;
    })
    .map(([skill]) => skill);
}

// ── Achievements ──────────────────────────────────────────────────────────────

export async function getUserAchievements(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(userAchievements)
    .where(eq(userAchievements.userId, userId))
    .orderBy(desc(userAchievements.earnedAt));
}

// ── Streaks ───────────────────────────────────────────────────────────────────

export async function getUserStreak(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(learningStreaks)
    .where(eq(learningStreaks.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

export async function updateLearningStreak(
  userId: number,
  currentStreak: number,
  longestStreak: number
) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(learningStreaks)
    .values({ userId, currentStreak, longestStreak, lastActivityDate: new Date() })
    .onConflictDoUpdate({
      target: learningStreaks.userId,
      set: { currentStreak, longestStreak, lastActivityDate: new Date(), updatedAt: new Date() },
    });
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export async function getTopScorers(limit: number = 10) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(
    sql`
      SELECT u.id, u.name, u.email,
             SUM(qa.correct_answers) AS total_correct,
             COUNT(DISTINCT qa.lesson_id) AS lessons_completed,
             AVG(qa.score::numeric) AS avg_score
      FROM users u
      JOIN quiz_attempts qa ON qa.user_id = u.id
      GROUP BY u.id, u.name, u.email
      ORDER BY avg_score DESC, total_correct DESC
      LIMIT ${limit}
    `
  );
  return result.rows as unknown[];
}

// ── IELTS Results ─────────────────────────────────────────────────────────────

export async function saveIeltsResult(data: InsertIeltsResult) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(ieltsResults).values(data).returning();
  return result[0] ?? null;
}

export async function getUserIeltsResults(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(ieltsResults)
    .where(eq(ieltsResults.userId, userId))
    .orderBy(desc(ieltsResults.completedAt));
}

// ── Login Sessions ────────────────────────────────────────────────────────────
import { loginSessions } from "../drizzle/schema";

export async function recordLoginSession(
  userId: number,
  sessionId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(loginSessions).values({
      userId,
      sessionId,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      isActive: true,
    }).onConflictDoUpdate({
      target: loginSessions.sessionId,
      set: { lastSeenAt: new Date(), isActive: true },
    });
  } catch (err) {
    console.warn("[DB] recordLoginSession error:", err);
  }
}

export async function invalidateLoginSession(sessionId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.update(loginSessions)
      .set({ isActive: false, loggedOutAt: new Date() })
      .where(eq(loginSessions.sessionId, sessionId));
  } catch (err) {
    console.warn("[DB] invalidateLoginSession error:", err);
  }
}

export async function getUserActiveSessions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(loginSessions)
      .where(and(eq(loginSessions.userId, userId), eq(loginSessions.isActive, true)))
      .orderBy(desc(loginSessions.lastSeenAt));
  } catch (err) {
    console.warn("[DB] getUserActiveSessions error:", err);
    return [];
  }
}

// ── IELTS Feedback ────────────────────────────────────────────────────────────
import { ieltsFeedback, InsertIeltsFeedback } from "../drizzle/schema";

export async function saveIeltsFeedback(data: {
  userId: number;
  ieltsResultId?: number;
  skill: string;
  source: string;
  overallBand?: number;
  overallFeedback?: string;
  perQuestion?: unknown[];
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(ieltsFeedback).values({
      userId:          data.userId,
      ieltsResultId:   data.ieltsResultId ?? null,
      skill:           data.skill,
      source:          data.source,
      overallBand:     data.overallBand?.toString() ?? null,
      overallFeedback: data.overallFeedback ?? null,
      perQuestion:     data.perQuestion ? JSON.stringify(data.perQuestion) : null,
    });
  } catch (err) {
    console.warn("[DB] saveIeltsFeedback error:", err);
  }
}

export async function getUserIeltsFeedback(userId: number, skill?: string) {
  const db = await getDb();
  if (!db) return [];
  try {
    const query = db
      .select()
      .from(ieltsFeedback)
      .where(
        skill
          ? and(eq(ieltsFeedback.userId, userId), eq(ieltsFeedback.skill, skill))
          : eq(ieltsFeedback.userId, userId)
      )
      .orderBy(desc(ieltsFeedback.createdAt));
    return await query;
  } catch (err) {
    console.warn("[DB] getUserIeltsFeedback error:", err);
    return [];
  }
}
