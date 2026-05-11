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
} from "../drizzle/schema";
import { ENV } from "./_core/env";

// ── DB connection (lazy, singleton) ─────────────────────────────────────────
let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

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
  return db.select().from(lessons).orderBy(lessons.order);
}

export async function getLessonsByCategory(category: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(lessons).where(eq(lessons.category, category)).orderBy(lessons.order);
}

export async function getLessonsByDifficulty(difficulty: "Beginner" | "Intermediate" | "Advanced") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(lessons).where(eq(lessons.difficulty, difficulty)).orderBy(lessons.order);
}

export async function getLessonById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(lessons).where(eq(lessons.id, id)).limit(1);
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