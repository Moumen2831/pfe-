export const cefrLevels = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const lessonSkills = ["vocabulary", "grammar", "dialogue", "listening", "speaking", "mixed"] as const;

export type CefrLevel = (typeof cefrLevels)[number];
export type LessonSkill = (typeof lessonSkills)[number];

export type GenerateLessonInput = {
  cefrLevel: CefrLevel;
  topic: string;
  skillFocus: LessonSkill;
  estimatedDurationMinutes: number;
};

export type LessonBlockType =
  | "vocabulary"
  | "grammar"
  | "dialogue"
  | "listening"
  | "speaking"
  | "quiz";

export type DynamicLesson = {
  title: string;
  description: string;
  leadIn?: string;
  exampleSentences?: string[];
  cefrLevel: CefrLevel;
  topic: string;
  skillFocus: LessonSkill;
  estimatedDurationMinutes: number;
  learningObjectives: string[];
  blocks: Array<Record<string, unknown> & { id: string; type: LessonBlockType; title: string }>;
  metadata: {
    generatedBy: string;
    version: number;
    language: "en";
    createdFor?: string;
    vrReady?: boolean;
    seed?: number;
  };
  vrScene?: {
    enabled: boolean;
    environment?: string;
    interactions?: Array<Record<string, unknown>>;
  };
};
