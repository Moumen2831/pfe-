import { COOKIE_NAME } from "@shared/const";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
      });
      return { success: true } as const;
    }),
  }),

  lessons: router({
    all:          publicProcedure.query(() => db.getAllLessons()),
    byCategory:   publicProcedure.input(z.object({ category: z.string() })).query(({ input }) => db.getLessonsByCategory(input.category)),
    byDifficulty: publicProcedure.input(z.object({ difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]) })).query(({ input }) => db.getLessonsByDifficulty(input.difficulty)),
    byId:         publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getLessonById(input.id)),
  }),

  quiz: router({
    getQuestions:  publicProcedure.input(z.object({ lessonId: z.number() })).query(({ input }) => db.getQuizQuestionsByLesson(input.lessonId)),
    submitAttempt: protectedProcedure.input(z.object({
      lessonId:       z.number(),
      score:          z.number(),
      totalQuestions: z.number(),
      correctAnswers: z.number(),
      answers:        z.array(z.any()),
    })).mutation(async ({ ctx, input }) => {
      await db.recordQuizAttempt(ctx.user.id, input.lessonId, input.score, input.totalQuestions, input.correctAnswers, input.answers);
      await db.markLessonComplete(ctx.user.id, input.lessonId);
      return { success: true };
    }),
    getAttempts:  protectedProcedure.input(z.object({ lessonId: z.number() })).query(({ ctx, input }) => db.getUserQuizAttempts(ctx.user.id, input.lessonId)),
    getBestScore: protectedProcedure.input(z.object({ lessonId: z.number() })).query(({ ctx, input }) => db.getUserBestScore(ctx.user.id, input.lessonId)),
  }),

  progress: router({
    getCompletedLessons: protectedProcedure.query(({ ctx }) => db.getUserCompletedLessons(ctx.user.id)),
    getProgress:         protectedProcedure.input(z.object({ lessonId: z.number() })).query(({ ctx, input }) => db.getUserProgress(ctx.user.id, input.lessonId)),
    getQuizAttempts:     protectedProcedure.query(({ ctx }) => db.getAllUserQuizAttempts(ctx.user.id)),
    markComplete:        protectedProcedure.input(z.object({ lessonId: z.number() })).mutation(async ({ ctx, input }) => {
      await db.markLessonComplete(ctx.user.id, input.lessonId);
      return { success: true };
    }),
  }),

  achievements: router({
    getUserAchievements: protectedProcedure.query(({ ctx }) => db.getUserAchievements(ctx.user.id)),
  }),

  streak: router({
    getStreak:    protectedProcedure.query(({ ctx }) => db.getUserStreak(ctx.user.id)),
    updateStreak: protectedProcedure.input(z.object({ currentStreak: z.number(), longestStreak: z.number() })).mutation(async ({ ctx, input }) => {
      await db.updateLearningStreak(ctx.user.id, input.currentStreak, input.longestStreak);
      return { success: true };
    }),
  }),

  leaderboard: router({
    getTopScorers: publicProcedure.input(z.object({ limit: z.number().default(10) })).query(({ input }) => db.getTopScorers(input.limit)),
  }),

  sessions: router({
    getMySessions: protectedProcedure.query(({ ctx }) => db.getUserActiveSessions(ctx.user.id)),
  }),

  ielts: router({
    submitResult: protectedProcedure.input(z.object({
      skill:          z.string(),
      score:          z.number(),
      totalQuestions: z.number(),
      correctAnswers: z.number(),
      timeTaken:      z.number(),
      answers:        z.array(z.any()),
    })).mutation(async ({ ctx, input }) => {
      const saved = await db.saveIeltsResult({
        userId:         ctx.user.id,
        skill:          input.skill,
        score:          input.score,
        totalQuestions: input.totalQuestions,
        correctAnswers: input.correctAnswers,
        timeTaken:      input.timeTaken,
        answers:        JSON.stringify(input.answers),
      });
      return { success: true, id: saved?.id ?? null };
    }),

    getMyResults: protectedProcedure.query(({ ctx }) => db.getUserIeltsResults(ctx.user.id)),

    saveFeedback: protectedProcedure.input(z.object({
      ieltsResultId:   z.number().optional(),
      skill:           z.string(),
      source:          z.string(),
      overallBand:     z.number().optional(),
      overallFeedback: z.string().optional(),
      perQuestion:     z.array(z.any()).optional(),
    })).mutation(async ({ ctx, input }) => {
      await db.saveIeltsFeedback({
        userId:          ctx.user.id,
        ieltsResultId:   input.ieltsResultId,
        skill:           input.skill,
        source:          input.source,
        overallBand:     input.overallBand,
        overallFeedback: input.overallFeedback,
        perQuestion:     input.perQuestion,
      });
      return { success: true };
    }),

    getMyFeedback: protectedProcedure
      .input(z.object({ skill: z.string().optional() }))
      .query(({ ctx, input }) => db.getUserIeltsFeedback(ctx.user.id, input.skill)),
  }),
});

export type AppRouter = typeof appRouter;