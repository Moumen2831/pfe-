export type LessonBlock =
  | VocabularyBlock
  | GrammarBlock
  | DialogueBlock
  | ListeningBlock
  | SpeakingBlock
  | QuizBlock;

export type DynamicLesson = {
  title: string;
  description: string;
  leadIn?: string;
  exampleSentences?: string[];
  cefrLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  topic: string;
  skillFocus: "vocabulary" | "grammar" | "dialogue" | "listening" | "speaking" | "mixed";
  estimatedDurationMinutes: number;
  learningObjectives: string[];
  blocks: LessonBlock[];
  metadata: {
    generatedBy: string;
    version: number;
    language: "en";
    createdFor?: string;
    vrReady?: boolean;
  };
};

export type VocabularyBlock = {
  id: string;
  type: "vocabulary";
  title: string;
  items: Array<{
    word: string;
    definition: string;
    example: string;
    translation?: string | null;
  }>;
};

export type GrammarBlock = {
  id: string;
  type: "grammar";
  title: string;
  explanation: string;
  examples: string[];
  sections?: Array<{
    heading: string;
    explanation: string;
    examples?: string[];
    table?: {
      headers: string[];
      rows: string[][];
    };
  }>;
  commonMistakes?: Array<{
    incorrect: string;
    correct: string;
    note: string;
  }>;
  practice: Array<{
    prompt: string;
    expectedAnswer: string;
  }>;
};

export type DialogueBlock = {
  id: string;
  type: "dialogue";
  title: string;
  speakers: Array<{ name: string; role: string }>;
  lines: Array<{ speaker: string; text: string }>;
};

export type ListeningBlock = {
  id: string;
  type: "listening";
  title: string;
  audioText: string;
  questions: QuizQuestion[];
};

export type SpeakingBlock = {
  id: string;
  type: "speaking";
  title: string;
  instruction: string;
  targetText: string;
  evaluationCriteria: {
    pronunciation: boolean;
    fluency: boolean;
    accuracy: boolean;
  };
};

export type QuizBlock = {
  id: string;
  type: "quiz";
  title: string;
  questions: QuizQuestion[];
};

export type QuizQuestion = {
  id?: string;
  type: "multiple_choice" | "fill_in_blank" | "short_answer" | string;
  question: string;
  options?: string[];
  correctAnswer: unknown;
  explanation?: string;
};
