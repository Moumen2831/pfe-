import { z } from "zod";
import { cefrLevels, lessonSkills } from "./lesson.types";

const baseBlock = {
  id: z.string().min(1),
  title: z.string().min(1),
};

const vocabularyBlockSchema = z.object({
  ...baseBlock,
  type: z.literal("vocabulary"),
  items: z.array(z.object({
    word: z.string().min(1),
    definition: z.string().min(1),
    example: z.string().min(1),
    translation: z.string().nullable().optional(),
  })).min(3),
});

const grammarBlockSchema = z.object({
  ...baseBlock,
  type: z.literal("grammar"),
  explanation: z.string().min(1),
  examples: z.array(z.string().min(1)).min(2),
  sections: z.array(z.object({
    heading: z.string().min(1),
    explanation: z.string().min(1),
    examples: z.array(z.string()).optional(),
    table: z.object({
      headers: z.array(z.string()),
      rows: z.array(z.array(z.string())),
    }).optional(),
  })).optional(),
  commonMistakes: z.array(z.object({
    incorrect: z.string(),
    correct: z.string(),
    note: z.string(),
  })).optional(),
  practice: z.array(z.object({
    prompt: z.string().min(1),
    expectedAnswer: z.string().min(1),
  })).min(1),
});

const dialogueBlockSchema = z.object({
  ...baseBlock,
  type: z.literal("dialogue"),
  speakers: z.array(z.object({
    name: z.string().min(1),
    role: z.string().min(1),
  })).min(1),
  lines: z.array(z.object({
    speaker: z.string().min(1),
    text: z.string().min(1),
  })).min(2),
});

const listeningBlockSchema = z.object({
  ...baseBlock,
  type: z.literal("listening"),
  audioText: z.string().min(1),
  questions: z.array(z.object({
    id: z.string().optional(),
    type: z.string().min(1),
    question: z.string().min(1),
    options: z.array(z.string()).optional(),
    correctAnswer: z.unknown(),
    explanation: z.string().optional(),
  })).min(1),
});

const speakingBlockSchema = z.object({
  ...baseBlock,
  type: z.literal("speaking"),
  instruction: z.string().min(1),
  targetText: z.string().min(1),
  evaluationCriteria: z.object({
    pronunciation: z.boolean(),
    fluency: z.boolean(),
    accuracy: z.boolean(),
  }),
});

const quizBlockSchema = z.object({
  ...baseBlock,
  type: z.literal("quiz"),
  questions: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(["multiple_choice", "fill_in_blank", "short_answer"]),
    question: z.string().min(1),
    options: z.array(z.string()).optional(),
    correctAnswer: z.unknown(),
    explanation: z.string().optional(),
  })).min(1),
});

export const lessonBlockSchema = z.discriminatedUnion("type", [
  vocabularyBlockSchema,
  grammarBlockSchema,
  dialogueBlockSchema,
  listeningBlockSchema,
  speakingBlockSchema,
  quizBlockSchema,
]);

export const dynamicLessonSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  leadIn: z.string().optional(),
  exampleSentences: z.array(z.string()).optional(),
  cefrLevel: z.enum(cefrLevels),
  topic: z.string().min(2),
  skillFocus: z.enum(lessonSkills),
  estimatedDurationMinutes: z.number().int().min(5).max(90),
  learningObjectives: z.array(z.string().min(3)).min(2),
  blocks: z.array(lessonBlockSchema).min(3),
  metadata: z.object({
    generatedBy: z.string().min(1),
    version: z.number().int().min(1),
    language: z.literal("en"),
    createdFor: z.string().optional(),
    vrReady: z.boolean().optional(),
    seed: z.number().optional(),
  }),
  vrScene: z.object({
    enabled: z.boolean(),
    environment: z.string().optional(),
    interactions: z.array(z.record(z.string(), z.unknown())).optional(),
  }).optional(),
});

export const generateLessonInputSchema = z.object({
  cefrLevel: z.enum(cefrLevels),
  topic: z.string().min(2).max(100),
  skillFocus: z.enum(lessonSkills),
  estimatedDurationMinutes: z.number().int().min(5).max(90).default(25),
});

export type DynamicLessonSchema = z.infer<typeof dynamicLessonSchema>;
