import type { GenerateLessonInput } from "./lesson.types";

const cefrProfiles = {
  A1: {
    learnerProfile: "absolute beginner using short, concrete sentences",
    lexicalDemand: "common everyday words, no idioms",
    grammarDemand: "simple present, be/have, basic questions, imperatives",
    outputDemand: "short controlled practice",
    vocabularyCount: 6,
    dialogueLines: 6,
    listeningWords: "80-110",
    quizQuestions: 5,
  },
  A2: {
    learnerProfile: "elementary learner handling routine situations",
    lexicalDemand: "high-frequency words plus practical collocations",
    grammarDemand: "past simple, future plans, comparatives, polite requests",
    outputDemand: "guided but meaningful practice",
    vocabularyCount: 7,
    dialogueLines: 8,
    listeningWords: "110-150",
    quizQuestions: 6,
  },
  B1: {
    learnerProfile: "independent learner explaining opinions and experiences",
    lexicalDemand: "topic vocabulary, phrasal verbs, common academic/workplace phrases",
    grammarDemand: "conditionals, present perfect, reported speech, linking devices",
    outputDemand: "open-ended practice with reasons and examples",
    vocabularyCount: 8,
    dialogueLines: 10,
    listeningWords: "150-210",
    quizQuestions: 7,
  },
  B2: {
    learnerProfile: "upper-intermediate learner discussing abstract and professional topics",
    lexicalDemand: "precise collocations, discourse markers, nuanced adjectives",
    grammarDemand: "modality, hedging, complex clauses, concession and contrast",
    outputDemand: "analytical practice requiring justification",
    vocabularyCount: 10,
    dialogueLines: 12,
    listeningWords: "210-280",
    quizQuestions: 8,
  },
  C1: {
    learnerProfile: "advanced learner needing fluent, flexible, academic/professional English",
    lexicalDemand: "advanced collocations, idiomatic but appropriate phrases, register-sensitive vocabulary",
    grammarDemand: "nominalisation, inversion for emphasis, advanced hedging, stance markers, complex subordination",
    outputDemand: "extended production, critical reasoning, nuance, register control, and self-correction",
    vocabularyCount: 12,
    dialogueLines: 14,
    listeningWords: "280-380",
    quizQuestions: 10,
  },
  C2: {
    learnerProfile: "near-native learner refining rhetorical precision and stylistic control",
    lexicalDemand: "high-precision vocabulary, idiomatic nuance, rhetorical phrases, register shifts",
    grammarDemand: "clefting, ellipsis, fronting, rhetorical emphasis, dense complex syntax",
    outputDemand: "sophisticated analysis, reformulation, persuasion, and subtle tone management",
    vocabularyCount: 14,
    dialogueLines: 16,
    listeningWords: "350-480",
    quizQuestions: 12,
  },
} as const;

export function buildLessonPrompt(input: GenerateLessonInput) {
  const generationSeed = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const profile = cefrProfiles[input.cefrLevel];
  return `
You are a senior English curriculum designer building CEFR-calibrated lessons for an intelligent tutoring system.
Generate one complete, substantial English lesson as valid JSON only.
Use a clear British Council-style lesson pattern: short learner question, examples first, test 1, explanation, test 2.
Do not copy any British Council text. Create original content for the requested topic and level.

Lesson constraints:
- CEFR level: ${input.cefrLevel}
- Topic: ${input.topic}
- Skill focus: ${input.skillFocus}
- Estimated duration: ${input.estimatedDurationMinutes} minutes
- Generation seed: ${generationSeed}
- Audience: university PFE prototype learners
- Output language: English

CEFR calibration:
- Learner profile: ${profile.learnerProfile}
- Lexical demand: ${profile.lexicalDemand}
- Grammar demand: ${profile.grammarDemand}
- Task demand: ${profile.outputDemand}
- The lesson must feel genuinely ${input.cefrLevel}, not a simplified beginner lesson.

The JSON must contain:
title, description, leadIn, exampleSentences, cefrLevel, topic, skillFocus, estimatedDurationMinutes,
learningObjectives, blocks, metadata, and optional vrScene.

Required teaching order:
1. Root leadIn: a learner-facing question like "Do you know how to ...?"
2. Root exampleSentences: 4-8 short examples showing the target language before explanation.
3. Quiz block titled "Grammar test 1" or "Test 1" to diagnose knowledge before explanation.
4. Grammar block titled "Grammar explanation" with clear subheadings, examples, and tables/lists.
5. Quiz block titled "Grammar test 2" or "Practice test" after the explanation.
6. Add vocabulary, dialogue, listening, and speaking blocks when skillFocus is mixed or relevant.

Allowed block types:
vocabulary, grammar, dialogue, listening, speaking, quiz.

Required block structure:
- vocabulary block: id, type="vocabulary", title, items.
  items must contain at least ${profile.vocabularyCount} entries.
  each item must include word, definition, example, translation=null.
- grammar block: id, type="grammar", title, explanation, examples, practice.
  explanation must be detailed and CEFR-calibrated.
  sections must include 2-5 sub-sections with heading, explanation, examples, and optional table.
  commonMistakes should include 2-4 useful corrections.
  examples must contain at least 5 examples for B2-C2 and at least 3 examples for A1-B1.
  practice must contain at least 4 tasks.
- dialogue block: id, type="dialogue", title, speakers, lines.
  lines must contain at least ${profile.dialogueLines} turns.
  For C1-C2, include nuance, clarification, stance, reformulation, and register-aware phrasing.
- listening block: id, type="listening", title, audioText, questions.
  audioText must be ${profile.listeningWords} words.
  questions must include comprehension, inference, vocabulary-in-context, and speaker-intent questions.
- speaking block: id, type="speaking", title, instruction, targetText, evaluationCriteria.
  For B2-C2, targetText must be an extended speaking prompt, not one sentence.
- quiz block: id, type="quiz", title, questions.
  questions must contain at least ${profile.quizQuestions} items with correctAnswer and explanation.
  Include two quiz blocks when possible: one before explanation and one after explanation.

Rules:
- Return JSON only. No markdown. No explanation outside JSON.
- Use age-neutral, classroom-safe content.
- Use vocabulary and grammar appropriate for ${input.cefrLevel}.
- Avoid generic filler such as "practice English" unless it is topic-specific.
- Do not create a short demo lesson. Create production-quality lesson content.
- Prefer focused grammar-teaching lessons over generic mixed-topic lessons when the topic is grammar-related.
- The explanation should be concise but complete: definition, rule, contrast, table/list, examples, common learner mistakes.
- Tests should be practical and check the exact target language from the explanation.
- Include feedback-ready tasks with answer keys.
- Make the structure renderer-friendly for a React frontend.
- Create fresh wording and examples for this generation seed.
- Every block must have a unique stable id.
- metadata must include generatedBy, version, language="en", createdFor="testing", vrReady=true.
- Add vrScene.enabled=false but keep the structure future-compatible.
`;
}
