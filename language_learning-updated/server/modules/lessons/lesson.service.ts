import { dynamicLessonSchema, generateLessonInputSchema } from "./lesson.schema";
import { createPrototypeLesson, generateLessonWithLlama, normalizeGeneratedLesson } from "./llamaLesson.service";
import type { GenerateLessonInput } from "./lesson.types";

export function mapCefrToDifficulty(cefrLevel: GenerateLessonInput["cefrLevel"]) {
  if (cefrLevel === "A1" || cefrLevel === "A2") return "Beginner";
  if (cefrLevel === "B1" || cefrLevel === "B2") return "Intermediate";
  return "Advanced";
}

export function assertRequiredBlocks(lesson: unknown) {
  const parsed = dynamicLessonSchema.parse(lesson);
  const blockTypes = new Set(parsed.blocks.map(block => block.type));
  const required = parsed.skillFocus === "mixed"
    ? ["vocabulary", "grammar", "dialogue", "listening", "speaking", "quiz"]
    : [parsed.skillFocus, "quiz"];

  const missing = required.filter(type => !blockTypes.has(type as never));
  if (missing.length > 0) {
    throw new Error(`Generated lesson is missing required block(s): ${missing.join(", ")}`);
  }

  return parsed;
}

export async function generateValidatedLesson(rawInput: unknown) {
  const input = generateLessonInputSchema.parse(rawInput);
  const { lesson, prompt } = await generateLessonWithLlama(input);
  try {
    const parsed = assertRequiredBlocks(normalizeGeneratedLesson(lesson, input));
    return { lesson: parsed, prompt };
  } catch (error) {
    console.warn("[Lessons] Generated lesson failed repair, using validated prototype:", error);
    const parsed = assertRequiredBlocks(createPrototypeLesson(input));
    return { lesson: parsed, prompt };
  }
}
