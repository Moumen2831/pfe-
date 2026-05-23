import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
  numeric,
  index,
  jsonb,
  serial,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Enums ────────────────────────────────────────────────────────────────────
export const roleEnum       = pgEnum("role",       ["user", "admin"]);
export const difficultyEnum = pgEnum("difficulty", ["Beginner", "Intermediate", "Advanced"]);
export const questionTypeEnum = pgEnum("question_type_app", ["multiple_choice", "fill_in_blank"]);
export const cefrLevelEnum = pgEnum("cefr_level", ["A1", "A2", "B1", "B2", "C1", "C2"]);
export const lessonSkillEnum = pgEnum("lesson_skill", ["vocabulary", "grammar", "dialogue", "listening", "speaking", "mixed"]);
export const lessonStatusEnum = pgEnum("lesson_status", ["draft", "published", "archived", "failed_validation"]);
export const lessonProgressStatusEnum = pgEnum("lesson_progress_status", ["not_started", "in_progress", "completed"]);

// ── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id:           serial("id").primaryKey(),
  openId:       varchar("openId",       { length: 64  }).notNull().unique(),
  name:         text("name"),
  email:        varchar("email",        { length: 320 }).unique(),
  username:     varchar("username",     { length: 64  }).unique(),
  passwordHash: varchar("passwordHash", { length: 256 }),
  loginMethod:  varchar("loginMethod",  { length: 64  }),
  role:         roleEnum("role").default("user").notNull(),
  createdAt:    timestamp("createdAt").defaultNow().notNull(),
  updatedAt:    timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User       = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── Lessons ──────────────────────────────────────────────────────────────────
export const lessons = pgTable("lessons", {
  id:          serial("id").primaryKey(),
  title:       varchar("title",    { length: 255 }).notNull(),
  description: text("description"),
  category:    varchar("category", { length: 100 }).notNull(),
  difficulty:  difficultyEnum("difficulty").notNull(),
  content:     text("content").notNull(),
  examples:    text("examples"),
  order:       integer("order").default(0),
  cefrLevel:   cefrLevelEnum("cefrLevel"),
  skillFocus:  lessonSkillEnum("skillFocus"),
  topic:       varchar("topic", { length: 100 }),
  estimatedDurationMinutes: integer("estimatedDurationMinutes"),
  lessonJson:  jsonb("lessonJson"),
  generationPrompt: text("generationPrompt"),
  generatedBy: varchar("generatedBy", { length: 100 }),
  version:     integer("version").default(1).notNull(),
  status:      lessonStatusEnum("status").default("draft").notNull(),
  createdAt:   timestamp("createdAt").defaultNow().notNull(),
  updatedAt:   timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  categoryIdx:   index("category_idx").on(table.category),
  difficultyIdx: index("difficulty_idx").on(table.difficulty),
  cefrIdx:       index("lesson_cefr_idx").on(table.cefrLevel),
  skillIdx:      index("lesson_skill_idx").on(table.skillFocus),
  statusIdx:     index("lesson_status_idx").on(table.status),
}));

export type Lesson       = typeof lessons.$inferSelect;
export type InsertLesson = typeof lessons.$inferInsert;

// ── Quiz Questions ───────────────────────────────────────────────────────────
export const quizQuestions = pgTable("quiz_questions", {
  id:            serial("id").primaryKey(),
  lessonId:      integer("lessonId").notNull(),
  question:      text("question").notNull(),
  type:          questionTypeEnum("type").notNull(),
  options:       text("options"),
  correctAnswer: text("correctAnswer").notNull(),
  explanation:   text("explanation"),
  order:         integer("order").default(0),
  createdAt:     timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  lessonIdIdx: index("lesson_id_idx").on(table.lessonId),
}));

export type QuizQuestion       = typeof quizQuestions.$inferSelect;
export type InsertQuizQuestion = typeof quizQuestions.$inferInsert;

// ── User Progress ────────────────────────────────────────────────────────────
export const userProgress = pgTable("user_progress", {
  id:          serial("id").primaryKey(),
  userId:      integer("userId").notNull(),
  lessonId:    integer("lessonId").notNull(),
  completed:   boolean("completed").default(false).notNull(),
  status:      lessonProgressStatusEnum("status").default("not_started").notNull(),
  completionPercentage: numeric("completionPercentage", { precision: 5, scale: 2 }).default("0").notNull(),
  score:       numeric("score", { precision: 5, scale: 2 }).default("0").notNull(),
  vocabularyScore: numeric("vocabularyScore", { precision: 5, scale: 2 }),
  grammarScore:    numeric("grammarScore", { precision: 5, scale: 2 }),
  listeningScore:  numeric("listeningScore", { precision: 5, scale: 2 }),
  speakingScore:   numeric("speakingScore", { precision: 5, scale: 2 }),
  quizScore:       numeric("quizScore", { precision: 5, scale: 2 }),
  startedAt:   timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt:   timestamp("createdAt").defaultNow().notNull(),
  updatedAt:   timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  userLessonIdx: index("user_lesson_idx").on(table.userId, table.lessonId),
  userLessonUniqueIdx: uniqueIndex("user_lesson_unique_idx").on(table.userId, table.lessonId),
}));

export type UserProgress       = typeof userProgress.$inferSelect;
export type InsertUserProgress = typeof userProgress.$inferInsert;

export const lessonAttempts = pgTable("lesson_attempts", {
  id:        serial("id").primaryKey(),
  userId:    integer("userId").notNull(),
  lessonId:  integer("lessonId").notNull(),
  blockId:   varchar("blockId", { length: 100 }).notNull(),
  blockType: varchar("blockType", { length: 50 }).notNull(),
  userAnswer: jsonb("userAnswer"),
  aiFeedback: jsonb("aiFeedback"),
  score:     numeric("score", { precision: 5, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userLessonBlockIdx: index("lesson_attempt_user_lesson_block_idx").on(table.userId, table.lessonId, table.blockId),
}));

export type LessonAttempt = typeof lessonAttempts.$inferSelect;
export type InsertLessonAttempt = typeof lessonAttempts.$inferInsert;

export const speakingAttempts = pgTable("speaking_attempts", {
  id:        serial("id").primaryKey(),
  userId:    integer("userId").notNull(),
  lessonId:  integer("lessonId").notNull(),
  speakingTaskId: varchar("speakingTaskId", { length: 100 }).notNull(),
  audioUrl: text("audioUrl"),
  transcript: text("transcript"),
  targetText: text("targetText").notNull(),
  pronunciationScore: numeric("pronunciationScore", { precision: 5, scale: 2 }),
  fluencyScore: numeric("fluencyScore", { precision: 5, scale: 2 }),
  accuracyScore: numeric("accuracyScore", { precision: 5, scale: 2 }),
  whisperResult: jsonb("whisperResult"),
  speechbrainResult: jsonb("speechbrainResult"),
  llamaFeedback: jsonb("llamaFeedback"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  speakingUserLessonIdx: index("speaking_attempt_user_lesson_idx").on(table.userId, table.lessonId),
}));

export type SpeakingAttempt = typeof speakingAttempts.$inferSelect;
export type InsertSpeakingAttempt = typeof speakingAttempts.$inferInsert;

export const recommendations = pgTable("recommendations", {
  id:        serial("id").primaryKey(),
  userId:    integer("userId").notNull(),
  lessonId:  integer("lessonId").notNull(),
  reason:    text("reason").notNull(),
  priority:  integer("priority").default(1).notNull(),
  recommendationType: varchar("recommendationType", { length: 50 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  recommendationUserIdx: index("recommendation_user_idx").on(table.userId),
  recommendationPriorityIdx: index("recommendation_priority_idx").on(table.userId, table.priority),
}));

export type Recommendation = typeof recommendations.$inferSelect;
export type InsertRecommendation = typeof recommendations.$inferInsert;

// ── Quiz Attempts ────────────────────────────────────────────────────────────
export const quizAttempts = pgTable("quiz_attempts", {
  id:             serial("id").primaryKey(),
  userId:         integer("userId").notNull(),
  lessonId:       integer("lessonId").notNull(),
  score:          numeric("score", { precision: 5, scale: 2 }).notNull(),
  totalQuestions: integer("totalQuestions").notNull(),
  correctAnswers: integer("correctAnswers").notNull(),
  answers:        text("answers"),
  attemptNumber:  integer("attemptNumber").default(1).notNull(),
  completedAt:    timestamp("completedAt").defaultNow().notNull(),
}, (table) => ({
  userLessonIdx: index("user_lesson_attempt_idx").on(table.userId, table.lessonId),
}));

export type QuizAttempt       = typeof quizAttempts.$inferSelect;
export type InsertQuizAttempt = typeof quizAttempts.$inferInsert;

// ── Achievements ─────────────────────────────────────────────────────────────
export const achievements = pgTable("achievements", {
  id:          serial("id").primaryKey(),
  name:        varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  icon:        varchar("icon", { length: 255 }),
  criteria:    text("criteria"),
  createdAt:   timestamp("createdAt").defaultNow().notNull(),
});

export type Achievement       = typeof achievements.$inferSelect;
export type InsertAchievement = typeof achievements.$inferInsert;

// ── User Achievements ────────────────────────────────────────────────────────
export const userAchievements = pgTable("user_achievements", {
  id:            serial("id").primaryKey(),
  userId:        integer("userId").notNull(),
  achievementId: integer("achievementId").notNull(),
  earnedAt:      timestamp("earnedAt").defaultNow().notNull(),
}, (table) => ({
  userAchievementIdx: index("user_achievement_idx").on(table.userId, table.achievementId),
}));

export type UserAchievement       = typeof userAchievements.$inferSelect;
export type InsertUserAchievement = typeof userAchievements.$inferInsert;

// ── Learning Streaks ──────────────────────────────────────────────────────────
export const learningStreaks = pgTable("learning_streaks", {
  id:               serial("id").primaryKey(),
  userId:           integer("userId").notNull().unique(),
  currentStreak:    integer("currentStreak").default(0).notNull(),
  longestStreak:    integer("longestStreak").default(0).notNull(),
  lastActivityDate: timestamp("lastActivityDate"),
  updatedAt:        timestamp("updatedAt").defaultNow().notNull(),
});

export type LearningStreak       = typeof learningStreaks.$inferSelect;
export type InsertLearningStreak = typeof learningStreaks.$inferInsert;

// ── IELTS Test Results ────────────────────────────────────────────────────────
// Stores results submitted from the IeltsTestPage after each completed test
export const ieltsResults = pgTable("ielts_results", {
  id:             serial("id").primaryKey(),
  userId:         integer("userId").notNull(),
  skill:          varchar("skill", { length: 50 }).notNull(),   // "ielts" or section name
  score:          integer("score").notNull(),                    // 0-100 percentage
  totalQuestions: integer("totalQuestions").notNull(),
  correctAnswers: integer("correctAnswers").notNull(),
  timeTaken:      integer("timeTaken").notNull(),                // seconds
  answers:        text("answers"),                               // JSON
  completedAt:    timestamp("completedAt").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("ielts_results_user_idx").on(table.userId),
}));

export type IeltsResult       = typeof ieltsResults.$inferSelect;
export type InsertIeltsResult = typeof ieltsResults.$inferInsert;

// ── Login Sessions ────────────────────────────────────────────────────────────
// Records each login event per user for session tracking and audit
export const loginSessions = pgTable("login_sessions", {
  id:         serial("id").primaryKey(),
  userId:     integer("userId").notNull(),
  sessionId:  varchar("sessionId", { length: 128 }).notNull().unique(),
  ipAddress:  varchar("ipAddress", { length: 64 }),
  userAgent:  text("userAgent"),
  loginAt:    timestamp("loginAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  loggedOutAt:timestamp("loggedOutAt"),
  isActive:   boolean("isActive").default(true).notNull(),
}, (table) => ({
  userIdIdx:   index("login_sessions_user_idx").on(table.userId),
  sessionIdx:  index("login_sessions_session_idx").on(table.sessionId),
  activeIdx:   index("login_sessions_active_idx").on(table.userId, table.isActive),
}));

export type LoginSession       = typeof loginSessions.$inferSelect;
export type InsertLoginSession = typeof loginSessions.$inferInsert;

// ── IELTS Feedback ────────────────────────────────────────────────────────────
// Stores LLaMA + SpeechBrain evaluation feedback per skill per test attempt.
export const ieltsFeedback = pgTable("ielts_feedback", {
  id:              serial("id").primaryKey(),
  userId:          integer("userId").notNull(),
  ieltsResultId:   integer("ieltsResultId"),               // links to ielts_results
  skill:           varchar("skill",           { length: 50 }).notNull(),  // 'Writing' | 'Speaking'
  source:          varchar("source",          { length: 50 }).notNull(),  // 'llama' | 'speechbrain' | 'combined'
  overallBand:     numeric("overallBand",     { precision: 4, scale: 2 }), // e.g. 6.50
  overallFeedback: text("overallFeedback"),                // holistic 4-5 sentence feedback
  perQuestion:     text("perQuestion"),                    // JSON: per-question scores + feedback
  createdAt:       timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdx:   index("ielts_feedback_user_idx").on(table.userId),
  resultIdx: index("ielts_feedback_result_idx").on(table.ieltsResultId),
  skillIdx:  index("ielts_feedback_skill_idx").on(table.userId, table.skill),
}));

export type IeltsFeedback       = typeof ieltsFeedback.$inferSelect;
export type InsertIeltsFeedback = typeof ieltsFeedback.$inferInsert;
