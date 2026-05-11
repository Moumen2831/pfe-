CREATE TYPE "public"."difficulty" AS ENUM('Beginner', 'Intermediate', 'Advanced');--> statement-breakpoint
CREATE TYPE "public"."question_type_app" AS ENUM('multiple_choice', 'fill_in_blank');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(255),
	"criteria" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ielts_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"skill" varchar(50) NOT NULL,
	"score" integer NOT NULL,
	"totalQuestions" integer NOT NULL,
	"correctAnswers" integer NOT NULL,
	"timeTaken" integer NOT NULL,
	"answers" text,
	"completedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_streaks" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"currentStreak" integer DEFAULT 0 NOT NULL,
	"longestStreak" integer DEFAULT 0 NOT NULL,
	"lastActivityDate" timestamp,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "learning_streaks_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100) NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"content" text NOT NULL,
	"examples" text,
	"order" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"sessionId" varchar(128) NOT NULL,
	"ipAddress" varchar(64),
	"userAgent" text,
	"loginAt" timestamp DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp DEFAULT now() NOT NULL,
	"loggedOutAt" timestamp,
	"isActive" boolean DEFAULT true NOT NULL,
	CONSTRAINT "login_sessions_sessionId_unique" UNIQUE("sessionId")
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"lessonId" integer NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"totalQuestions" integer NOT NULL,
	"correctAnswers" integer NOT NULL,
	"answers" text,
	"attemptNumber" integer DEFAULT 1 NOT NULL,
	"completedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"lessonId" integer NOT NULL,
	"question" text NOT NULL,
	"type" "question_type_app" NOT NULL,
	"options" text,
	"correctAnswer" text NOT NULL,
	"explanation" text,
	"order" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"achievementId" integer NOT NULL,
	"earnedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"lessonId" integer NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"username" varchar(64),
	"passwordHash" varchar(256),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE INDEX "ielts_results_user_idx" ON "ielts_results" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "category_idx" ON "lessons" USING btree ("category");--> statement-breakpoint
CREATE INDEX "difficulty_idx" ON "lessons" USING btree ("difficulty");--> statement-breakpoint
CREATE INDEX "login_sessions_user_idx" ON "login_sessions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "login_sessions_session_idx" ON "login_sessions" USING btree ("sessionId");--> statement-breakpoint
CREATE INDEX "login_sessions_active_idx" ON "login_sessions" USING btree ("userId","isActive");--> statement-breakpoint
CREATE INDEX "user_lesson_attempt_idx" ON "quiz_attempts" USING btree ("userId","lessonId");--> statement-breakpoint
CREATE INDEX "lesson_id_idx" ON "quiz_questions" USING btree ("lessonId");--> statement-breakpoint
CREATE INDEX "user_achievement_idx" ON "user_achievements" USING btree ("userId","achievementId");--> statement-breakpoint
CREATE INDEX "user_lesson_idx" ON "user_progress" USING btree ("userId","lessonId");