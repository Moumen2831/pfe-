import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";

describe("Lessons Router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(() => {
    caller = appRouter.createCaller({
      user: null,
      req: {} as any,
      res: {} as any,
    });
  });

  it("should fetch all lessons", async () => {
    const lessons = await caller.lessons.all();
    expect(Array.isArray(lessons)).toBe(true);
    if (lessons.length > 0) {
      expect(lessons[0]).toHaveProperty("id");
      expect(lessons[0]).toHaveProperty("title");
      expect(lessons[0]).toHaveProperty("category");
      expect(lessons[0]).toHaveProperty("difficulty");
    }
  });

  it("should fetch lessons by category", async () => {
    const lessons = await caller.lessons.byCategory({ category: "Vocabulary" });
    expect(Array.isArray(lessons)).toBe(true);
    if (lessons.length > 0) {
      expect(lessons[0].category).toBe("Vocabulary");
    }
  });

  it("should fetch lessons by difficulty", async () => {
    const lessons = await caller.lessons.byDifficulty({ difficulty: "Beginner" });
    expect(Array.isArray(lessons)).toBe(true);
    if (lessons.length > 0) {
      expect(lessons[0].difficulty).toBe("Beginner");
    }
  });

  it("should fetch lesson by id", async () => {
    const lesson = await caller.lessons.byId({ id: 1 });
    if (lesson) {
      expect(lesson).toHaveProperty("id");
      expect(lesson).toHaveProperty("content");
      expect(lesson.id).toBe(1);
    }
  });
});

describe("Quiz Router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(() => {
    caller = appRouter.createCaller({
      user: null,
      req: {} as any,
      res: {} as any,
    });
  });

  it("should fetch quiz questions by lesson", async () => {
    const questions = await caller.quiz.getQuestions({ lessonId: 1 });
    expect(Array.isArray(questions)).toBe(true);
    if (questions.length > 0) {
      expect(questions[0]).toHaveProperty("question");
      expect(questions[0]).toHaveProperty("type");
      expect(questions[0]).toHaveProperty("correctAnswer");
    }
  });
});

describe("Leaderboard Router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(() => {
    caller = appRouter.createCaller({
      user: null,
      req: {} as any,
      res: {} as any,
    });
  });

  it("should fetch top scorers", async () => {
    const scorers = await caller.leaderboard.getTopScorers({ limit: 10 });
    expect(Array.isArray(scorers)).toBe(true);
  });

  it("should respect limit parameter", async () => {
    const scorers = await caller.leaderboard.getTopScorers({ limit: 5 });
    expect(scorers.length).toBeLessThanOrEqual(5);
  });
});
