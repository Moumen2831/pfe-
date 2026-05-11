import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Loader2, Mic, MicOff, X, ChevronRight, Star, Volume2, BookOpen, Headphones, CheckCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── ENV ──────────────────────────────────────────────────────────────────────
// VITE_OPENROUTER_API_KEY  → enables final Writing + Speaking evaluation
// VITE_AZURE_SPEECH_KEY + VITE_AZURE_SPEECH_REGION → optional pronunciation scores
const OPENROUTER_API_KEY  = import.meta.env.VITE_OPENROUTER_API_KEY  as string | undefined;
const AZURE_SPEECH_KEY    = import.meta.env.VITE_AZURE_SPEECH_KEY    as string | undefined;
const AZURE_SPEECH_REGION = import.meta.env.VITE_AZURE_SPEECH_REGION as string | undefined;
const AZURE_AVAILABLE      = !!(AZURE_SPEECH_KEY && AZURE_SPEECH_REGION);
const GROQ_AVAILABLE       = !!OPENROUTER_API_KEY;
const WEB_SPEECH_AVAILABLE = typeof window !== "undefined"
  && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  console.log("[IELTS] GROQ_AVAILABLE:", GROQ_AVAILABLE, "key starts with:", OPENROUTER_API_KEY?.slice(0, 8));

// ─── Types ────────────────────────────────────────────────────────────────────
interface IeltsQuestion {
  questionId: number;
  skill?: string;
  section: string;
  text: string;
  sourceTitle?: string;
  sourceContent?: string;
  sourceImageUrl?: string;
  sourceAudioUrl?: string;  // backend listening audio
  niveau?: string | null;
  sourceTextId?: number;
  passageText?: string;
  audioUrl?: string;        // legacy field
  options: string[];
  correctAnswer: string;
  timeLimitSeconds: number;
  questionType?: string;
}

interface UserAnswer {
  questionId: number;
  answer: string;         // text / transcript / A-D / "skipped"
  timeTaken: number;
}

// Collected during the test, used for batch evaluation at the end
interface CollectedWritingEntry  { questionIndex: number; question: string; answer: string;     niveau?: string | null; }

// SpeechBrain /evaluate-auto response shape
interface SpeechBrainEvalResult {
  success: boolean;
  score: number;             // 0–100 overall
  clarity_score: number;
  pace_score: number;
  fluency_level: string;     // "poor" | "fair" | "good" | "excellent"
  speaking_rate: number;
  word_count: number;
  duration_seconds: number;
  processing_time: number;
  transcription: string;     // actual API field (was: what_they_said)
  what_they_said?: string;   // optional alias
  feedback: string;
  suggestions: string[];
}

interface CollectedSpeakingEntry {
  questionIndex: number;
  question: string;
  transcript: string;
  niveau?: string | null;
  skipped?: boolean;
  sbResult?: SpeechBrainEvalResult | null;  // per-question SpeechBrain result
  // legacy fields kept for OpenRouter prompt compatibility
  speechScores?: { accuracyScore: number; fluencyScore: number; completenessScore: number; wer: number } | null;
  // Enhanced per-question scoring
  contentScore?: number | null;    // 0–4: LLaMA content/relevance score
  speakingScore?: number | null;   // 0–6: derived from SpeechBrain fluency/score
  finalScore?: number | null;      // 0–10: contentScore + speakingScore
  contentFeedback?: string | null; // LLaMA per-question content feedback
}

// LLaMA batch content evaluation result per question
interface SpeakingContentEval {
  questionIndex: number;   // matches CollectedSpeakingEntry.questionIndex
  contentScore: number;    // 0–4
  feedback: string;        // 1-2 sentence feedback
}

// Aggregated speaking score result
interface SpeakingAggregatedResult {
  totalScore: number;           // sum of all finalScores
  maxPossible: number;          // max possible (10 × attempted)
  percentage: number;           // 0–100
  bandScore: number;            // 1–9 IELTS band derived from percentage
  skippedCount: number;
  attemptedCount: number;
  perQuestion: { contentScore: number; speakingScore: number; finalScore: number; feedback: string }[];
}

// Final evaluation results
interface SectionEval {
  bandScore: number;       // 1–9
  taskAchievement: string;
  vocabularyRange: string;
  grammaticalAccuracy: string;
  coherenceOrFluency: string;
  overallFeedback: string;
}

// Per-question writing score result
interface WritingQuestionScore {
  questionIndex: number;
  score: number;        // 0–10
  feedback: string;     // 1-2 sentence feedback
}

// Aggregated writing evaluation result
interface WritingAggregatedResult {
  perQuestion: WritingQuestionScore[];
  totalScore: number;       // sum of all scores
  maxPossible: number;      // 10 × number of answered questions
  averageScore: number;     // 0–10 average
  percentage: number;       // 0–100
}

// ─── OpenRouter helpers ─────────────────────────────────────────────────────────────
async function callGroq(prompt: string): Promise<string> {
  if (!GROQ_AVAILABLE) throw new Error("OpenRouter not configured");

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 3000 * attempt)); // 3s, 6s backoff
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENROUTER_API_KEY}` },
      body: JSON.stringify({
        model: "meta-llama/llama-3.1-8b-instruct",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (res.status === 429 || res.status === 402) {
      console.warn(`[IELTS] OpenRouter ${res.status}, retrying (attempt ${attempt + 1})...`);
      continue;
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const objMatch = content.match(/\{[\s\S]*\}/);
    return objMatch ? objMatch[0] : content.replace(/```json|```/g, "").trim();
  }
  throw new Error("OpenRouter rate limit: all retries exhausted");
}


// Map CEFR niveau label to a numeric difficulty weight for scoring
function niveauWeight(niveau?: string | null): number {
  switch ((niveau ?? "").toUpperCase()) {
    case "A1": return 0.7;
    case "A2": return 0.8;
    case "B1": return 0.9;
    case "B2": return 1.0;
    case "C1": return 1.1;
    case "C2": return 1.2;
    default:   return 1.0;
  }
}

function niveauLabel(niveau?: string | null): string {
  const map: Record<string, string> = {
    A1: "beginner (A1)", A2: "elementary (A2)",
    B1: "intermediate (B1)", B2: "upper-intermediate (B2)",
    C1: "advanced (C1)",     C2: "proficient (C2)",
  };
  return map[(niveau ?? "").toUpperCase()] ?? "general difficulty";
}

/** Evaluate a single writing entry for content quality (0–10) via LLaMA. */
async function evaluateOneWritingQuestion(e: CollectedWritingEntry, taskNum: number): Promise<WritingQuestionScore> {
  const lvl = niveauLabel(e.niveau);
  const prompt = [
    "You are an expert IELTS Writing examiner. Evaluate this single writing task.",
    "",
    `Task ${taskNum} [Difficulty: ${lvl}]`,
    `Question: ${e.question}`,
    `Answer: ${e.answer || "(no answer)"}`,
    "",
    "Score 0-10:",
    "0  = no answer / completely irrelevant",
    "1-2 = very poor: barely addresses the task, severe language errors",
    "3-4 = weak: partial task achievement, many errors, limited vocabulary",
    "5-6 = adequate: addresses the task with some gaps, noticeable errors but understandable",
    "7-8 = good: mostly complete response, clear organisation, good vocabulary and grammar",
    "9-10 = excellent: fully addresses task, well-organised, wide vocabulary, accurate grammar",
    "",
    "Adjust your score for the difficulty level: a strong answer to a C1 prompt earns more than the same quality at A1.",
    "",
    'Reply ONLY with a JSON object, no markdown: { "score": <0-10>, "feedback": "<1-2 sentences>" }',
  ].join("\n");

  const raw = await callGroq(prompt);
  const objMatch = raw.match(/\{[\s\S]*\}/);
  const cleaned = objMatch ? objMatch[0] : raw;
  const parsed = JSON.parse(cleaned) as { score: number; feedback: string };
  return {
    questionIndex: e.questionIndex,
    score: Math.min(10, Math.max(0, Math.round(parsed.score ?? 0))),
    feedback: parsed.feedback ?? "",
  };
}

/** Evaluate all writing entries one-by-one and return per-question scores + holistic SectionEval. */
async function evaluateWritingBatch(entries: CollectedWritingEntry[]): Promise<{
  aggregated: WritingAggregatedResult;
  sectionEval: SectionEval;
}> {
  // Step 1: Per-question scoring (0–10 each)
  const perQuestion: WritingQuestionScore[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 4000)); // avoid rate limit
    try {
      const result = await evaluateOneWritingQuestion(entries[i], i + 1);
      console.log("[IELTS] Writing Q" + (i + 1) + " score=" + result.score + " feedback:", result.feedback);
      perQuestion.push(result);
    } catch (err) {
      console.error("[IELTS] Writing eval failed for Q" + (i + 1) + ":", err);
      perQuestion.push({ questionIndex: entries[i].questionIndex, score: 0, feedback: "Evaluation failed for this question." });
    }
  }

  const totalScore  = perQuestion.reduce((s, q) => s + q.score, 0);
  const maxPossible = entries.length * 10;
  const averageScore = entries.length > 0 ? Math.round((totalScore / maxPossible) * 10) : 0; // 0–10 avg
  const percentage  = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;

  const aggregated: WritingAggregatedResult = { perQuestion, totalScore, maxPossible, averageScore, percentage };

  // Step 2: Holistic SectionEval for detailed modal
  const answersBlock = entries.map((e, i) => {
    const lvl = niveauLabel(e.niveau);
    const qs  = perQuestion[i];
    return `--- Task ${i + 1} [Difficulty: ${lvl}] [Score: ${qs?.score ?? "?"}/10] ---\nQuestion: ${e.question}\nAnswer: ${e.answer || "(no answer)"}`;
  }).join("\n\n");

  const avgWeight = entries.reduce((s, e) => s + niveauWeight(e.niveau), 0) / entries.length;
  const difficultyNote = avgWeight >= 1.1
    ? "The tasks were advanced/proficient level (C1-C2). A good response at this level requires complex vocabulary, sophisticated structures, and nuanced argumentation."
    : avgWeight >= 0.9
    ? "The tasks were intermediate to upper-intermediate level (B1-B2). A good response should show clear organisation, appropriate vocabulary, and mostly accurate grammar."
    : "The tasks were beginner to elementary level (A1-A2). Expectations are adjusted accordingly — clear communication and basic accuracy are the primary measures.";

  const prompt = `You are an expert IELTS Writing examiner evaluating ALL writing tasks from one candidate together as a holistic performance.

DIFFICULTY CONTEXT: ${difficultyNote}

IMPORTANT: Each task has already been individually scored 0-10 (shown in brackets). Use these scores as context.

${answersBlock}

Evaluate the candidate's OVERALL writing performance across ALL tasks as a whole.
Return ONLY a valid JSON object with no markdown, no extra text:
{
  "bandScore": <number 1-9, 0.5 increments allowed — weighted by task difficulty>,
  "taskAchievement": "<2-3 sentences: did they address each task fully and appropriately for its level?>",
  "vocabularyRange": "<2-3 sentences: lexical resource relative to the difficulty of the tasks>",
  "grammaticalAccuracy": "<2-3 sentences: grammatical range and accuracy relative to task level>",
  "coherenceOrFluency": "<2-3 sentences: cohesion, organisation and logical flow across all tasks>",
  "overallFeedback": "<4-5 sentences: overall strengths, weaknesses, and specific improvement advice for Writing>"
}`;

  const json = await callGroq(prompt);
  const sectionEval = JSON.parse(json) as SectionEval;
  return { aggregated, sectionEval };
}

/** Evaluate a single speaking entry for content relevance (0–4) via LLaMA. */
async function evaluateOneSpeakingContent(e: CollectedSpeakingEntry): Promise<SpeakingContentEval> {
  const lvl = niveauLabel(e.niveau);
  const prompt = [
    "You are an IELTS Speaking examiner. Evaluate how well the candidate answered the question.",
    "",
    "Difficulty: " + lvl,
    "Question: " + e.question,
    "Candidate transcript: " + e.transcript,
    "",
    "Score 0-4:",
    "0 = no answer / completely off-topic",
    "1 = barely relevant",
    "2 = partially addresses the question",
    "3 = mostly correct with minor gaps",
    "4 = fully and clearly answers the question",
    "",
    "Speech transcripts may have recognition errors — judge intended meaning.",
    "A clear relevant answer deserves 3 or 4 even with imperfect grammar.",
    "",
    'Reply ONLY with a JSON object, no markdown, no explanation: { "contentScore": <0-4>, "feedback": "<1-2 sentences>" }',
  ].join("\n");

  // around line 207-214
   const raw = await callGroq(prompt);
   console.log("[IELTS] Raw LLaMA response for Q" + e.questionIndex + ":", raw); // ← add this
    const objMatch = raw.match(/\{[\s\S]*\}/);
    const cleaned = objMatch ? objMatch[0] : raw;
    const parsed = JSON.parse(cleaned) as { contentScore: number; feedback: string };
    return {
    questionIndex: e.questionIndex,
    contentScore: Math.min(4, Math.max(0, Math.round(parsed.contentScore ?? 0))),
    feedback: parsed.feedback ?? "",
  };
}

/** Evaluate all speaking entries one-by-one to avoid LLM token truncation on large batches. */
async function evaluateSpeakingContentBatch(entries: CollectedSpeakingEntry[]): Promise<SpeakingContentEval[]> {
  const attempted = entries.filter(
    e => !e.skipped && e.transcript && e.transcript !== "(skipped)" && e.transcript !== "(no transcript)"
  );
  if (attempted.length === 0) return [];

  console.log("[IELTS] Evaluating content for", attempted.length, "speaking entries individually...");
  const results: SpeakingContentEval[] = [];

  for (const e of attempted) {
    if (results.length > 0) await new Promise(r => setTimeout(r, 5000)); // 5s gap to avoid rate limit
    try {
      const result = await evaluateOneSpeakingContent(e);
      console.log("[IELTS] Q" + e.questionIndex + " contentScore=" + result.contentScore + " feedback:", result.feedback);
      results.push(result);
    } catch (err) {
      console.error("[IELTS] Content eval failed for Q" + e.questionIndex + ":", err);
      results.push({ questionIndex: e.questionIndex, contentScore: 0, feedback: "Evaluation failed for this question." });
    }
  }
  return results;
}

/**
 * Convert SpeechBrain score (0–100) to speaking score (0–6).
 * 0–6 scale: 0=no speech, 1=poor, 2=fair, 3=average, 4=good, 5=very good, 6=excellent
 */
function sbScoreToSpeakingScore(sbResult: SpeechBrainEvalResult | null | undefined): number {
  if (!sbResult) return 0;
  const s = sbResult.score; // 0–100
  if (s >= 90) return 6;
  if (s >= 78) return 5;
  if (s >= 65) return 4;
  if (s >= 50) return 3;
  if (s >= 35) return 2;
  if (s >= 15) return 1;
  return 0;
}

/**
 * Full speaking evaluation: collect all transcripts → LLaMA content scoring → 
 * combine with SpeechBrain speaking scores → aggregate final score.
 */
async function evaluateSpeakingFull(entries: CollectedSpeakingEntry[]): Promise<{
  aggregated: SpeakingAggregatedResult;
  sectionEval: SectionEval;
  enrichedEntries: CollectedSpeakingEntry[];
}> {
  // Step 1: LLaMA content evaluation for all attempted entries
  let contentEvals: SpeakingContentEval[] = [];
  try {
    contentEvals = await evaluateSpeakingContentBatch(entries);
  } catch (err) {
    console.warn("[IELTS] LLaMA content eval failed, defaulting to 0 content scores:", err);
  }

  // Step 2: Build a map from questionIndex → contentEval
  const contentMap = new Map<number, SpeakingContentEval>();
  contentEvals.forEach(ce => contentMap.set(ce.questionIndex, ce));
  console.log("[IELTS] contentEvals count:", contentEvals.length, "keys:", [...contentMap.keys()]);
  console.log("[IELTS] entry questionIndexes:", entries.map(e => e.questionIndex));

  // Step 3: Compute per-question scores and enrich entries
  const enrichedEntries: CollectedSpeakingEntry[] = entries.map(e => {
    if (e.skipped || e.transcript === "(skipped)") {
      return { ...e, contentScore: 0, speakingScore: 0, finalScore: 0, contentFeedback: "Skipped — 0 points awarded." };
    }
    if (!e.transcript || e.transcript === "(no transcript)") {
      // Audio submitted but nothing transcribed — give speaking score only, 0 content
      const speakingScore = sbScoreToSpeakingScore(e.sbResult);
      return { ...e, contentScore: 0, speakingScore, finalScore: speakingScore, contentFeedback: "No transcription captured — content could not be evaluated." };
    }
    const ce = contentMap.get(e.questionIndex);
    const contentScore  = ce?.contentScore ?? 0;                  // 0–4
    const speakingScore = sbScoreToSpeakingScore(e.sbResult);    // 0–6
    const finalScore    = contentScore + speakingScore;            // 0–10
    return {
      ...e,
      contentScore,
      speakingScore,
      finalScore,
      contentFeedback: ce?.feedback ?? "",
    };
  });

  // Step 4: Aggregate
  const attempted       = enrichedEntries.filter(e => !e.skipped && e.transcript !== "(skipped)");
  const totalScore      = enrichedEntries.reduce((s, e) => s + (e.finalScore ?? 0), 0);
  const maxPossible     = 100;  // Always 10 questions × 10 pts = 100
  const percentage      = Math.round((totalScore / maxPossible) * 100);
  const bandScore       = percentage >= 90 ? 9 : percentage >= 80 ? 8 : percentage >= 70 ? 7
                        : percentage >= 60 ? 6 : percentage >= 50 ? 5 : percentage >= 40 ? 4 : 3;

  const aggregated: SpeakingAggregatedResult = {
    totalScore,
    maxPossible,
    percentage,
    bandScore,
    skippedCount:  enrichedEntries.filter(e => e.skipped).length,
    attemptedCount: attempted.length,
    perQuestion: enrichedEntries.map(e => ({
      contentScore:  e.contentScore  ?? 0,
      speakingScore: e.speakingScore ?? 0,
      finalScore:    e.finalScore    ?? 0,
      feedback:      e.contentFeedback ?? "",
    })),
  };

  // Step 5: Also run holistic LLaMA SectionEval for the detailed modal
  const sectionEval = await evaluateSpeakingBatch(enrichedEntries);

  return { aggregated, sectionEval, enrichedEntries };
}

async function evaluateSpeakingBatch(entries: CollectedSpeakingEntry[]): Promise<SectionEval> {
  const attempted = entries.filter(e => !e.skipped && e.transcript && e.transcript !== "(skipped)");

  if (attempted.length === 0) {
    return {
      bandScore: 3,
      taskAchievement: "No speaking responses were recorded.",
      vocabularyRange: "Unable to assess.",
      grammaticalAccuracy: "Unable to assess.",
      coherenceOrFluency: "Unable to assess.",
      overallFeedback: "No speaking answers were submitted. Please attempt all speaking tasks in a future test.",
    };
  }

  const answersBlock = attempted.map((e, i) => {
    const lvl = niveauLabel(e.niveau);
    // Prefer richer sbResult scores; fall back to legacy speechScores
    let scores = "";
    if (e.sbResult) {
      scores = `\nSpeechBrain scores: overall=${(e.sbResult.score ?? 0).toFixed(1)}/100, clarity=${(e.sbResult.clarity_score ?? 0).toFixed(1)}/100, pace=${e.sbResult.pace_score ?? 0}/100, fluency_level=${e.sbResult.fluency_level ?? 'unknown'}, speaking_rate=${e.sbResult.speaking_rate ?? 0} words/sec, duration=${(e.sbResult.duration_seconds ?? 0).toFixed(1)}s`;
    } else if (e.speechScores) {
      scores = `\nSpeech scores: accuracy=${e.speechScores.accuracyScore}/100, fluency=${e.speechScores.fluencyScore}/100, WER=${e.speechScores.wer}%`;
    }
    return `--- Task ${i + 1} [Difficulty: ${lvl}] ---\nQuestion: ${e.question}\nTranscript: ${e.transcript}${scores}`;
  }).join("\n\n");

  const avgWeight = attempted.reduce((s, e) => s + niveauWeight(e.niveau), 0) / attempted.length;
  const difficultyNote = avgWeight >= 1.1
    ? "The tasks were advanced/proficient level (C1-C2). Expect complex discussion, sophisticated vocabulary, and nuanced opinions."
    : avgWeight >= 0.9
    ? "The tasks were intermediate to upper-intermediate (B1-B2). Clear communication, appropriate vocabulary, and organised responses are expected."
    : "The tasks were beginner to elementary level (A1-A2). Simple, clear answers are acceptable. Basic errors are expected at this level.";

  const transcriptNote = "NOTE: Transcripts are generated by SpeechBrain (server-side Whisper model) or Web Speech API if SpeechBrain was unavailable. Minor transcription errors are expected — evaluate the apparent intended meaning. Where SpeechBrain scores are provided, factor them into the fluency and pronunciation dimension of your assessment.";

  const prompt = `You are an expert IELTS Speaking examiner evaluating ALL speaking tasks from one candidate together.

DIFFICULTY CONTEXT: ${difficultyNote}

${transcriptNote}

IMPORTANT: When assigning the band score, weight the difficulty level of each task.
A sophisticated answer to a C1 prompt earns a higher band than the same quality of answer to an A1 prompt.
Simple answers to A1 prompts should not be penalised for lack of complexity.

${answersBlock}

Evaluate the candidate's OVERALL speaking performance across ALL tasks as a single holistic score.
Return ONLY a valid JSON object with no markdown, no extra text:
{
  "bandScore": <number 1-9, 0.5 increments allowed — weighted by task difficulty>,
  "taskAchievement": "<2-3 sentences: relevance and completeness of responses relative to task level>",
  "vocabularyRange": "<2-3 sentences: lexical resource and range, appropriate to difficulty>",
  "grammaticalAccuracy": "<2-3 sentences: grammatical range and accuracy relative to task level>",
  "coherenceOrFluency": "<2-3 sentences: fluency, coherence, and pronunciation as inferred from transcripts>",
  "overallFeedback": "<4-5 sentences: key strengths, areas for improvement, and specific speaking advice>"
}`;

  const json = await callGroq(prompt);
  return JSON.parse(json) as SectionEval;
}

// ─── SpeechBrain /evaluate-auto integration ──────────────────────────────────
const SPEECHBRAIN_URL = "http://localhost:5000/evaluate-pronunciation";

/**
 * Decode any browser audio blob (webm, ogg, mp4 …) to raw PCM via Web Audio API,
 * then encode it as a proper 16-bit 16 kHz mono WAV that SpeechBrain / ffmpeg
 * can open without errors.
 */
async function blobToWav(blob: Blob): Promise<Blob> {
  // 1. Decode the compressed audio into a float32 PCM AudioBuffer
  const arrayBuf  = await blob.arrayBuffer();
  const audioCtx  = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await audioCtx.decodeAudioData(arrayBuf);
  } finally {
    audioCtx.close();
  }

  // 2. Resample to 16 000 Hz mono (what Whisper / SpeechBrain prefers)
  const TARGET_SAMPLE_RATE = 16000;
  const offlineCtx = new OfflineAudioContext(
    1,                                                        // mono
    Math.ceil(decoded.duration * TARGET_SAMPLE_RATE),
    TARGET_SAMPLE_RATE,
  );
  const src = offlineCtx.createBufferSource();
  src.buffer = decoded;
  src.connect(offlineCtx.destination);
  src.start(0);
  const resampled = await offlineCtx.startRendering();

  // 3. Write a standard PCM WAV file
  const pcm        = resampled.getChannelData(0);          // Float32Array
  const numSamples = pcm.length;
  const bitsPerSample = 16;
  const byteRate   = TARGET_SAMPLE_RATE * 1 * (bitsPerSample / 8);
  const blockAlign = 1 * (bitsPerSample / 8);
  const dataBytes  = numSamples * blockAlign;
  const buffer     = new ArrayBuffer(44 + dataBytes);
  const view       = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  // RIFF header
  writeStr(0,  "RIFF");
  view.setUint32(4,  36 + dataBytes,         true); // chunk size
  writeStr(8,  "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16,                     true); // sub-chunk size (PCM)
  view.setUint16(20, 1,                      true); // PCM format
  view.setUint16(22, 1,                      true); // mono
  view.setUint32(24, TARGET_SAMPLE_RATE,     true);
  view.setUint32(28, byteRate,               true);
  view.setUint16(32, blockAlign,             true);
  view.setUint16(34, bitsPerSample,          true);
  writeStr(36, "data");
  view.setUint32(40, dataBytes,              true);

  // PCM samples: clamp float32 → int16
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

async function evaluateAudioWithSpeechBrain(blob: Blob): Promise<SpeechBrainEvalResult> {
  // Always convert to proper WAV — browser MediaRecorder produces webm/ogg
  // which SpeechBrain's ffmpeg backend cannot open reliably.
  const wavBlob = await blobToWav(blob);

  const formData = new FormData();
  formData.append("audio", wavBlob, "recording.wav");

  const res = await fetch(SPEECHBRAIN_URL, { method: "POST", body: formData });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`SpeechBrain HTTP ${res.status}: ${errText}`);
  }
  const data = await res.json();
  if (!data.success) throw new Error(`SpeechBrain error: ${data.error ?? "success=false"}`);
  return data as SpeechBrainEvalResult;
}

// ─── 80 built-in fallback questions (20 per section) ─────────────────────────
function buildFallbackQuestions(): IeltsQuestion[] {
  const qs: IeltsQuestion[] = [];
  let id = 9000;

  const listeningPassage = "You will hear a conversation between a student and a university accommodation officer discussing room availability, facilities, and rental costs for the upcoming academic year.";
  const listening = [
    { t:"The accommodation officer says rooms in Block A are available from which date?", o:["1 September","15 September","1 October","15 October"], a:"C" },
    { t:"What is the monthly rent for a standard single room?", o:["£450","£520","£580","£640"], a:"B" },
    { t:"Which facility is NOT available in Block B?", o:["Laundry room","Common room","Car park","Gym"], a:"D" },
    { t:"The student asks whether bills are included. What do bills cover?", o:["Water only","Electricity and water","All utilities","Utilities and internet"], a:"D" },
    { t:"How long is the minimum contract the university requires?", o:["One term","Six months","Nine months","One year"], a:"C" },
    { t:"The officer recommends the student apply by which method?", o:["In person","By post","Online portal","By phone"], a:"C" },
    { t:"What deposit amount is required to secure a room?", o:["£100","£200","£300","£400"], a:"B" },
    { t:"Block C is described as being how far from the main campus?", o:["5 minutes' walk","10 minutes' walk","15 minutes' walk","A bus ride away"], a:"B" },
    { t:"The student is told that a waiting list exists for which type of room?", o:["Standard single","En-suite single","Standard double","Studio flat"], a:"B" },
    { t:"What document must be submitted with the application?", o:["Passport only","Proof of enrolment","Bank statement","Two references"], a:"B" },
    { t:"The officer mentions that quiet hours are enforced between which times?", o:["10 PM–7 AM","11 PM–7 AM","11 PM–8 AM","Midnight–8 AM"], a:"B" },
    { t:"Which block has the fastest broadband connection?", o:["Block A","Block B","Block C","All are equal"], a:"A" },
    { t:"Overnight guests are allowed for a maximum of how many nights per week?", o:["One","Two","Three","There is no limit"], a:"B" },
    { t:"What is the penalty for breaking the accommodation contract early?", o:["One month's rent","Loss of deposit","Two months' rent","No penalty"], a:"A" },
    { t:"Maintenance requests should be submitted through which channel?", o:["Email","Phone","Online portal","In person"], a:"C" },
    { t:"Bike storage is located where?", o:["Inside each block","In the basement","In a separate outdoor area","Not available"], a:"C" },
    { t:"When does the application portal open for next year's accommodation?", o:["November","December","January","February"], a:"C" },
    { t:"A social event for new residents is held how often?", o:["Weekly","Monthly","At the start of each term","Once a year"], a:"C" },
    { t:"The student's preferred room is on which floor?", o:["Ground floor","First floor","Second floor","Third floor"], a:"B" },
    { t:"What is the officer's name?", o:["Mrs. Davies","Mr. Collins","Ms. Ahmed","Dr. Patel"], a:"C" },
  ];
  listening.forEach(({ t, o, a }) =>
    qs.push({ questionId: id++, section: "Listening", text: t, passageText: listeningPassage, options: o, correctAnswer: a, timeLimitSeconds: 45 })
  );

  const readingPassage = `Urban Heat Islands: Causes, Effects, and Solutions\n\nAn urban heat island (UHI) is a metropolitan area significantly warmer than its surrounding rural areas due to human activities. The main cause is the modification of land surfaces — rooftops, roads, and pavements absorb solar radiation and re-emit it as heat. Dark-coloured surfaces absorb more heat than lighter ones. Vegetation provides shade and releases water vapour through evapotranspiration, which has a cooling effect. Cities have far less vegetation than rural areas.\n\nWaste heat from vehicles, air conditioning, and industry also contributes. Researchers estimate that in dense city centres, waste heat can add 2–3°C to local temperatures. Consequences include increased energy consumption, elevated emissions, compromised human health, and impaired water quality. High temperatures increase ground-level ozone concentration.\n\nMitigation strategies include increasing urban vegetation through parks, street trees, and green roofs, using lighter-coloured reflective materials (cool roofs), and improving urban planning to enhance airflow.`;
  const reading = [
    { t:"What is described as the main cause of the urban heat island effect?", o:["Vehicle emissions","Waste heat from industry","Modification of land surfaces","Lack of wind"], a:"C" },
    { t:"Which process is described as having a cooling effect on the environment?", o:["Solar radiation","Evapotranspiration","Waste heat generation","Ozone formation"], a:"B" },
    { t:"How much can waste heat add to city centre temperatures?", o:["1–2°C","2–3°C","3–4°C","4–5°C"], a:"B" },
    { t:"Which of the following is NOT listed as a consequence of UHIs?", o:["Increased energy consumption","Elevated greenhouse gas emissions","Reduced biodiversity","Impaired water quality"], a:"C" },
    { t:"What does the term 'cool roofs' refer to?", o:["Roofs with solar panels","Lighter-coloured reflective rooftops","Green roofs with vegetation","Roofs with AC units"], a:"B" },
    { t:"What health consequence is specifically mentioned?", o:["Respiratory infections","Higher ground-level ozone","Heatstroke","Skin damage"], a:"B" },
    { t:"What happens to air conditioning demand due to UHIs?", o:["It decreases","It stays the same","It increases","It is eliminated"], a:"C" },
    { t:"What colour surfaces absorb more heat?", o:["Light-coloured","White","Dark-coloured","Reflective"], a:"C" },
    { t:"Which mitigation involves planting plants on building surfaces?", o:["Cool pavements","Street trees","Green roofs","Urban parks"], a:"C" },
    { t:"When is the temperature difference most pronounced?", o:["During the day","At night","During winter only","At sunrise"], a:"B" },
    { t:"What does the passage say about economic expansion and UHIs?", o:["Growth reduces UHIs","Growth has no effect","Energy and waste heat rise as economies expand","Developing cities don't experience UHIs"], a:"C" },
    { t:"Which is presented as a way to enhance airflow through cities?", o:["Taller skyscrapers","Improved urban planning","Installing fans","Reducing population density"], a:"B" },
    { t:"Where is the ozone layer located?", o:["Troposphere","Stratosphere","Mesosphere","Thermosphere"], a:"B" },
    { t:"The UHI effect is most noticeable during which seasons?", o:["Spring and autumn","Summer and winter","Summer only","All seasons equally"], a:"B" },
    { t:"What is the overall purpose of the passage?", o:["To argue against urbanisation","To explain causes, effects, and solutions of UHIs","To promote tree-planting as the only solution","To compare city temperatures"], a:"B" },
    { t:"What does 'metropolitan area' mean in this context?", o:["A rural farming region","A large city and its surrounding suburbs","A coastal settlement","An industrial zone"], a:"B" },
    { t:"Which word is closest in meaning to 'release' in paragraph 2?", o:["Modify","Absorb","Emit","Reflect"], a:"C" },
    { t:"Which factor makes the UHI temperature difference more apparent?", o:["High humidity","Strong winds","Weak winds","Heavy rainfall"], a:"C" },
    { t:"Some cities have achieved measurable temperature reductions through what?", o:["Reflective road surfaces","Large-scale tree-planting programmes","Reducing industrial activity","Improving transport"], a:"B" },
    { t:"Vegetation is beneficial primarily because it provides shade and:", o:["Absorbs pollutants","Releases water vapour through evapotranspiration","Reflects solar radiation","Produces oxygen"], a:"B" },
  ];
  reading.forEach(({ t, o, a }) =>
    qs.push({ questionId: id++, section: "Reading", text: t, passageText: readingPassage, options: o, correctAnswer: a, timeLimitSeconds: 60 })
  );

  const writingTasks = [
    "Write a formal email to your employer requesting one week's unpaid leave. Include dates, explanation, and offer to arrange cover. (150–200 words)",
    "Social media has had more negative than positive effects on society. Discuss both views and give your opinion. (250 words)",
    "The chart shows household car ownership in four countries 1990–2020. Summarise key trends. (150 words)",
    "Write to your local council complaining about the poor condition of public parks. Suggest two improvements. (150–200 words)",
    "Discuss advantages and disadvantages of online university degrees vs. traditional study. (250 words)",
    "Write a complaint letter to a hotel manager describing two problems and requesting compensation. (150–200 words)",
    "Some governments invest in road expansion rather than public transport. Do you agree? (250 words)",
    "Write a report for your manager summarising a customer satisfaction survey. Recommend two actions. (200 words)",
    "Discuss effects of automation on employment. How should workers and governments respond? (250 words)",
    "Write a cover letter for a Marketing Assistant position at a tech company. (200 words)",
    "People are living longer. What challenges does this create and how can governments respond? (250 words)",
    "You damaged a classmate's book. Write an apology letter explaining what happened. (150 words)",
    "Children spend more time on devices than outdoors. Discuss causes and effects on development. (250 words)",
    "Write a proposal to your principal for a student mentoring programme. Explain benefits. (200 words)",
    "Tourism benefits economies but can damage environments and cultures. Discuss and give your view. (250 words)",
    "Email a colleague who has been absent, updating them on what they missed. (150 words)",
    "Housing costs have risen sharply in cities. Discuss causes and two government responses. (250 words)",
    "Write a review of a book or film for a cultural magazine. Include recommendation. (200 words)",
    "Should foreign language learning be compulsory throughout secondary school? Agree or disagree. (250 words)",
    "Write a formal letter to a university admissions office requesting information about postgraduate programmes. (150–200 words)",
  ];
  writingTasks.forEach((t, i) =>
    qs.push({ questionId: id++, section: "Writing", text: `Writing Task ${i + 1}: ${t}`, options: ["Text input required","","",""], correctAnswer: "text", timeLimitSeconds: 120 })
  );

  const speakingTasks = [
    "Describe a place in your hometown you find interesting. What makes it special and how often do you visit? (1–2 minutes)",
    "Talk about a person who has had a significant positive influence on your life. Who are they and what did you learn?",
    "Describe a skill you learned in the past two years. How did you learn it and how have you applied it?",
    "Talk about a memorable journey or holiday. Where did you go, what did you do, and why was it memorable?",
    "Describe a book, film, or TV series you enjoyed recently. What was it about and what did you like?",
    "Talk about a time you had to solve a difficult problem under pressure. What steps did you take?",
    "Describe your ideal career. What would you do daily, what skills would you use, and why does it appeal to you?",
    "Talk about a tradition or cultural festival important to you. What does it involve and why is it significant?",
    "Describe a piece of technology important in your daily life. What is it and why would you struggle without it?",
    "Talk about a time you collaborated as part of a team. What was your role and how successful were you?",
    "Describe a change you would like to see in your city. How would you implement it and what benefits would it bring?",
    "Talk about a leader you admire. What qualities make them effective and what can others learn from them?",
    "Describe a hobby you genuinely enjoy. How did you get into it and what do you get out of it?",
    "Talk about an environmental issue you feel strongly about. What causes it and what should be done?",
    "Describe a time you had to adapt quickly to an unfamiliar situation. How did you cope?",
    "Talk about the role of sport in society. Does competitive sport bring people together or create division?",
    "Describe a personal goal for the next five years. Why is it important and what steps are you taking?",
    "Talk about a time you gave or received helpful advice. What was the situation and what difference did it make?",
    "Describe qualities you value most in a close friendship. How do they show up in your own friendships?",
    "Talk about how your life might differ if you grew up in a different country. Consider culture, education, and opportunity.",
  ];
  speakingTasks.forEach((t, i) =>
    qs.push({ questionId: id++, section: "Speaking", text: `Speaking Task ${i + 1}: ${t}`, options: ["Voice recording required","","",""], correctAnswer: "text", timeLimitSeconds: 90 })
  );

  return qs;
}

function mergeWithFallback(backendQs: IeltsQuestion[]): IeltsQuestion[] {
  const sections = ["Listening","Reading","Writing","Speaking"] as const;
  const fallback  = buildFallbackQuestions();
  const result: IeltsQuestion[] = [];
  sections.forEach((section) => {
    const fromBackend  = backendQs.filter(q => q.section === section || q.skill?.toLowerCase() === section.toLowerCase());
    // Only pad with fallback if backend sent nothing for this section
    const fromFallback = fallback.filter(q => q.section === section);
    const source       = fromBackend.length > 0 ? fromBackend : fromFallback;
    const combined     = source.map((q, idx) => ({ ...q, questionId: result.length + idx + 1 }));
    result.push(...combined);
  });
  return result;
}

// ─── Score bar ────────────────────────────────────────────────────────────────
function ScoreBar({ label, score, max = 100 }: { label: string; score: number; max?: number }) {
  const pct   = Math.round((score / max) * 100);
  const color = pct >= 75 ? "from-emerald-400 to-green-500" : pct >= 55 ? "from-orange-400 to-amber-500" : "from-red-400 to-rose-500";
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-white/50 w-36 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-white w-8 text-right">{score}</span>
    </div>
  );
}

// ─── Final Section Eval Modal (Writing or Speaking) ───────────────────────────
function FinalEvalModal({
  section, result, bandColor, onClose,
}: { section: string; result: SectionEval; bandColor: string; onClose: () => void }) {
  const accent = section === "Writing" ? "text-purple-400 border-purple-500/30 bg-purple-500/5" : "text-orange-400 border-orange-500/30 bg-orange-500/5";
  const criteria = [
    ["Task Achievement", result.taskAchievement],
    ["Vocabulary Range", result.vocabularyRange],
    ["Grammar Accuracy", result.grammaticalAccuracy],
    [section === "Speaking" ? "Fluency & Coherence" : "Coherence & Cohesion", result.coherenceOrFluency],
  ] as [string, string][];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)" }}>
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem] border border-white/10 p-8" style={{ background: "rgba(12,18,38,0.98)" }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-extrabold text-white">{section} — Final Evaluation</h2>
            <p className="text-sm text-white/40 mt-0.5">All {section === "Writing" ? "writing tasks" : "speaking tasks"} evaluated together by OpenRouter AI</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all"><X size={18} /></button>
        </div>

        {/* Band score */}
        <div className="flex flex-col items-center p-6 rounded-2xl border border-white/10 bg-white/5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Star size={14} className="text-orange-400 fill-orange-400" />
            <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">{section} Band Score</span>
            <Star size={14} className="text-orange-400 fill-orange-400" />
          </div>
          <div className={`text-7xl font-black bg-gradient-to-r ${bandColor} bg-clip-text text-transparent`}>{result.bandScore}</div>
          <p className="text-xs text-white/30 mt-1">out of 9.0</p>
        </div>

        {/* Criteria */}
        <div className="space-y-3 mb-6">
          {criteria.map(([label, text]) => (
            <div key={label} className={`p-4 rounded-xl border ${accent}`}>
              <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "inherit" }}>{label}</p>
              <p className="text-sm text-white/80 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        {/* Overall feedback */}
        <div className="p-5 rounded-xl border border-cyan-500/25 bg-cyan-500/5 mb-6">
          <p className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2">Overall Feedback & Improvement Tips</p>
          <p className="text-sm text-white/80 leading-relaxed">{result.overallFeedback}</p>
        </div>

        <button onClick={onClose} className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:shadow-lg transition-all">
          <CheckCircle size={16} /> View Full Results
        </button>
      </div>
    </div>
  );
}

// ─── Speaking Recorder Modal ──────────────────────────────────────────────────
function SpeakingRecorderModal({
  question, taskNumber, totalTasks,
  onSubmit, onSkip,
}: {
  question: string; taskNumber: number; totalTasks: number;
  onSubmit: (transcript: string, blob: Blob | null) => void;
  onSkip: () => void;
}) {
  const [recording, setRecording]       = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [seconds, setSeconds]           = useState(0);
  const [transcript, setTranscript]     = useState("");
  const [sttError, setSttError]         = useState("");
  const [isListening, setIsListening]   = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mrRef          = useRef<MediaRecorder | null>(null);
  const chunksRef      = useRef<Blob[]>([]);
  const blobRef        = useRef<Blob | null>(null);
  const timerRef       = useRef<NodeJS.Timeout | null>(null);
  const fullTextRef    = useRef<string>("");

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const startRecording = async () => {
    setSttError(""); setTranscript(""); fullTextRef.current = "";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        // Keep whatever mimeType the browser chose (webm, ogg, mp4…).
        // blobToWav() will decode it properly via Web Audio API before sending.
        const mimeType = mr.mimeType || "audio/webm";
        blobRef.current = new Blob(chunksRef.current, { type: mimeType });
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start(); mrRef.current = mr;
    } catch { setSttError("Microphone access denied."); return; }

    if (WEB_SPEECH_AVAILABLE) {
      const Ctor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
      const rec: SpeechRecognition = new Ctor();
      rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true;
      rec.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) fullTextRef.current += event.results[i][0].transcript + " ";
          else interim = event.results[i][0].transcript;
        }
        setTranscript((fullTextRef.current + interim).trim());
      };
      rec.onerror = (e: SpeechRecognitionErrorEvent) => { if (e.error !== "no-speech" && e.error !== "aborted") setSttError(`Speech error: ${e.error}`); };
      rec.onend   = () => setIsListening(false);
      try { rec.start(); recognitionRef.current = rec; setIsListening(true); }
      catch { setSttError("Web Speech API failed. Try Chrome or Edge."); }
    } else {
      setSttError("Live transcription not supported in this browser (use Chrome/Edge).");
    }

    setRecording(true); setHasRecording(false); setSeconds(0);
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
  };

  const stopRecording = () => {
    mrRef.current?.stop();
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setRecording(false); setHasRecording(true);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleReRecord = () => {
    setHasRecording(false); setTranscript(""); fullTextRef.current = ""; blobRef.current = null; setSeconds(0); setSttError("");
  };

  const handleSubmit = () => {
    const finalTranscript = fullTextRef.current.trim() || transcript.trim();
    onSubmit(finalTranscript, blobRef.current);
  };

  const hasTranscript = transcript.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)" }}>
      <div className="relative w-full max-w-xl rounded-[2rem] border border-white/10 p-8" style={{ background: "rgba(12,18,38,0.98)" }}>
        <div className="absolute top-0 left-0 w-48 h-48 rounded-full bg-cyan-500 blur-[80px] opacity-10 pointer-events-none" />

        <div className="flex items-center justify-between mb-1">
          <h2 className="text-2xl font-extrabold text-white">Speaking Task {taskNumber}</h2>
          <span className="text-xs text-white/30 font-semibold">{taskNumber} / {totalTasks}</span>
        </div>
        <p className="text-white/40 text-xs mb-2">
          Each recording is evaluated individually by SpeechBrain for clarity, pace, and fluency.
          Transcripts are then combined at the end for a holistic OpenRouter band score.
        </p>

        {/* Badges */}
        <div className="flex gap-2 mb-5 flex-wrap">
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${WEB_SPEECH_AVAILABLE ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-white/5 text-white/30 border-white/10"}`}>
            {WEB_SPEECH_AVAILABLE ? "✓ Web Speech (free)" : "✗ Web Speech"}
          </span>
          <span className="px-2.5 py-1 rounded-full text-xs font-bold border bg-purple-500/20 text-purple-400 border-purple-500/30">
            ✓ SpeechBrain (STT + scores)
          </span>
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${GROQ_AVAILABLE ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-white/5 text-white/30 border-white/10"}`}>
            {GROQ_AVAILABLE ? "✓ OpenRouter (final eval)" : "○ OpenRouter not configured"}
          </span>
        </div>

        {/* Question */}
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-4">
          <p className="text-white/85 text-sm leading-relaxed">{question}</p>
        </div>

        {/* Live transcript box */}
        <div className={`rounded-xl border p-3 mb-4 min-h-[72px] transition-all ${recording ? "border-cyan-500/40 bg-cyan-500/5" : hasTranscript ? "border-white/15 bg-white/5" : "border-white/10 bg-black/10"}`}>
          {hasTranscript
            ? <p className="text-sm text-white/80 leading-relaxed">{transcript}</p>
            : <p className="text-sm text-white/25 italic">{recording && WEB_SPEECH_AVAILABLE ? "Speak now — transcript appears here…" : recording ? "Recording audio…" : "Your transcript will appear here as you speak"}</p>
          }
          {recording && isListening && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs text-cyan-400/70">Listening…</span>
            </div>
          )}
        </div>

        {sttError && <p className="text-xs text-yellow-400/80 mb-3 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">⚠️ {sttError}</p>}

        {/* Mic button */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={hasRecording && !recording}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg ${recording ? "bg-red-500 shadow-red-500/50 scale-110 animate-pulse" : hasRecording ? "bg-white/10 border-2 border-white/20 cursor-default" : "bg-gradient-to-br from-cyan-500 to-blue-600 shadow-cyan-500/30 hover:scale-105"}`}
          >
            {recording ? <MicOff size={28} className="text-white" /> : <Mic size={28} className="text-white" />}
          </button>
          <div className="text-center">
            {recording && <p className="text-red-400 font-mono text-lg font-bold">{fmt(seconds)}</p>}
            <p className="text-sm text-white/40 mt-0.5">{recording ? "Recording… tap to stop" : hasRecording ? `Recorded (${fmt(seconds)}) ✓` : "Tap to start recording"}</p>
          </div>
          {hasRecording && !recording && (
            <button onClick={handleReRecord} className="text-xs text-white/30 hover:text-white/60 underline transition-colors">Re-record</button>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={onSkip} className="flex-1 px-5 py-3 rounded-xl font-semibold text-white/40 bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm">Skip</button>
          <button
            onClick={handleSubmit}
            disabled={!hasRecording}
            className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-white transition-all text-sm ${hasRecording ? "bg-gradient-to-r from-cyan-500 to-blue-600 hover:shadow-lg hover:shadow-cyan-500/30" : "bg-gray-700 opacity-40 cursor-not-allowed"}`}
          >
            <ChevronRight size={16} /> Save & Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PassagePanel ─────────────────────────────────────────────────────────────
function PassagePanel({ section, sourceTitle, sourceContent, sourceImageUrl, audioUrl, niveau, passageText }:
  { section: string; sourceTitle?: string; sourceContent?: string; sourceImageUrl?: string; audioUrl?: string; niveau?: string; passageText?: string; }) {
  const [ttsPlaying, setTtsPlaying]   = useState(false);
  const [imgExpanded, setImgExpanded] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  // Prefer sourceContent, then passageText — try both
  const displayText  = (sourceContent ?? passageText ?? "").trim();
  const displayTitle = sourceTitle ?? "";
  const hasImage     = !!sourceImageUrl;
  const sec          = section.toLowerCase();
  const isListening  = sec === "listening";
  const isReading    = sec === "reading";
  const isWriting    = sec === "writing";
  const isSpeaking   = sec === "speaking";
  // For reading: always render the panel (even without text, to show a warning)
  // For other sections: skip if nothing to show
  if (!isReading && !displayText && !hasImage && !audioUrl) return null;

  const panelStyle = isListening
    ? { border: "border-blue-500/30",   bg: "bg-blue-500/5",   accent: "text-blue-400",   icon: <Headphones size={14} className="text-blue-400" />,  label: "Listening Material" }
    : isReading
    ? { border: "border-green-500/30",  bg: "bg-green-500/5",  accent: "text-green-400",  icon: <BookOpen   size={14} className="text-green-400" />,  label: "Reading Passage" }
    : isWriting
    ? { border: "border-purple-500/30", bg: "bg-purple-500/5", accent: "text-purple-400", icon: <BookOpen   size={14} className="text-purple-400" />, label: "Reference Material" }
    : { border: "border-cyan-500/30",   bg: "bg-cyan-500/5",   accent: "text-cyan-400",   icon: <Volume2    size={14} className="text-cyan-400" />,   label: "Context" };

  const handleTTS = () => {
    if (!displayText) return;
    if (ttsPlaying) { window.speechSynthesis.cancel(); setTtsPlaying(false); return; }
    const utt = new SpeechSynthesisUtterance(displayText);
    utt.lang = "en-US"; utt.rate = 0.9;
    utt.onend = () => setTtsPlaying(false);
    utteranceRef.current = utt;
    window.speechSynthesis.speak(utt); setTtsPlaying(true);
  };

  return (
    <div className={`rounded-2xl border p-5 mb-5 ${panelStyle.border} ${panelStyle.bg}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          {panelStyle.icon}
          <p className={`text-xs font-bold uppercase tracking-wider ${panelStyle.accent}`}>
            {displayTitle ? `${panelStyle.label}: ${displayTitle}` : panelStyle.label}
          </p>
          {niveau && <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/50 text-xs font-bold border border-white/10">{niveau}</span>}
          {hasImage && !displayText && <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold border border-amber-500/30">📷 Image Source</span>}
        </div>
        {(isListening || isSpeaking) && displayText && (
          <button onClick={handleTTS} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${ttsPlaying ? "bg-blue-500/30 border-blue-500/50 text-blue-300 animate-pulse" : "bg-white/5 border-white/15 text-white/50 hover:text-white hover:bg-white/10"}`}>
            <Volume2 size={11} />{ttsPlaying ? "Stop" : "▶ Play"}
          </button>
        )}
      </div>
      {audioUrl && (
        <div className="mb-4"><audio controls className="w-full rounded-lg" style={{ height: 36 }}><source src={audioUrl} type="audio/mpeg" /></audio></div>
      )}
      {hasImage && (
        <div className="mb-4">
          <img src={sourceImageUrl} alt={displayTitle || "Source image"} onClick={() => setImgExpanded(true)} className="w-full max-h-72 object-contain rounded-xl border border-white/10 bg-white/5 cursor-zoom-in" />
          <p className="text-xs text-white/30 mt-1 text-center">Click to enlarge</p>
          {imgExpanded && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 cursor-zoom-out" style={{ backgroundColor: "rgba(0,0,0,0.92)" }} onClick={() => setImgExpanded(false)}>
              <img src={sourceImageUrl} alt={displayTitle || "Source"} className="max-w-full max-h-full rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()} />
              <button onClick={() => setImgExpanded(false)} className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all"><X size={20} /></button>
            </div>
          )}
        </div>
      )}
      {displayText && (
        <div className={`text-sm text-white/85 leading-relaxed whitespace-pre-line ${isReading ? "max-h-64 overflow-y-auto pr-1" : ""}`}>
          {displayText}
        </div>
      )}
      {isReading && !displayText && (
        <p className="text-xs text-yellow-400/60 italic">⚠️ No passage text found for this question. Check that the backend includes <code>passageText</code> or <code>sourceContent</code> in the response.</p>
      )}
      {isReading && displayText.length > 400 && <p className="text-xs text-green-400/50 mt-2 italic">📖 Scroll to read the full passage before answering.</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function IeltsTestPage() {
  const [, navigate]        = useLocation();
  const { isAuthenticated } = useAuth();

  type Stage = "loading" | "test" | "evaluating" | "results";
  const [stage, setStage]                   = useState<Stage>("loading");
  const [evalStep, setEvalStep]             = useState(""); // sub-step label during evaluation
  const [usingFallback, setUsingFallback]   = useState(false);
  const [questions, setQuestions]           = useState<IeltsQuestion[]>([]);
  const [currentQuestionIndex, setCurrent]  = useState(0);
  const [userAnswers, setUserAnswers]       = useState<UserAnswer[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [timeRemaining, setTimeRemaining]   = useState(0);
  const timerRef         = useRef<NodeJS.Timeout | null>(null);
  const questionStartRef = useRef<number>(0);
  const testStartRef     = useRef<number>(0);

  // Collected answers for batch evaluation
  const collectedWriting  = useRef<CollectedWritingEntry[]>([]);
  const collectedSpeaking = useRef<CollectedSpeakingEntry[]>([]);

  // Speaking recorder state
  const [showRecorder, setShowRecorder] = useState(false);
  const [sbLoading, setSbLoading]       = useState(false);
  const speakingTaskNumber = useRef(0);

  // Results
  const [sectionScores, setSectionScores] = useState<Record<string, { correct: number; total: number; percentage: number }>>({});
  const [writingEval,   setWritingEval]   = useState<SectionEval | null>(null);
  const [writingAggregated, setWritingAggregated] = useState<WritingAggregatedResult | null>(null);
  const [speakingEval,  setSpeakingEval]  = useState<SectionEval | null>(null);
  const [speakingAggregated, setSpeakingAggregated] = useState<SpeakingAggregatedResult | null>(null);
  const enrichedSpeakingRef = useRef<CollectedSpeakingEntry[]>([]);
  const [showWritingModal,  setShowWritingModal]  = useState(false);
  const [showSpeakingModal, setShowSpeakingModal] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [expandedReviewQ, setExpandedReviewQ] = useState<Set<number>>(new Set());

const submitResult = trpc.ielts.submitResult.useMutation();
const saveFeedback = trpc.ielts.saveFeedback.useMutation();
  // ── Load questions ──────────────────────────────────────────────────────────
  const loadQuestions = async () => {
    setStage("loading");
    collectedWriting.current  = [];
    collectedSpeaking.current = [];
    speakingTaskNumber.current = 0;
    let backendQs: IeltsQuestion[] = [];
    try {
      const res = await fetch("/api/ielts-questions");
      if (res.ok) { const d = await res.json(); if (Array.isArray(d)) backendQs = d; }
    } catch { /* use fallback */ }
    const merged = mergeWithFallback(backendQs);
    setUsingFallback(backendQs.length === 0);
    setQuestions(merged);
    setCurrent(0); setUserAnswers([]); setSelectedAnswer("");
    testStartRef.current = Date.now();
    questionStartRef.current = Date.now();
    setStage("test");
  };

  useEffect(() => { if (isAuthenticated) loadQuestions(); }, [isAuthenticated]); // eslint-disable-line

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (stage !== "test" || showRecorder) return;
    const q = questions[currentQuestionIndex];
    if (!q) return;
    setTimeRemaining(q.timeLimitSeconds);
    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => { if (prev <= 1) { autoAdvance(); return 0; } return prev - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, currentQuestionIndex, questions, showRecorder]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const beginQuestion = (idx: number) => { setCurrent(idx); setSelectedAnswer(""); questionStartRef.current = Date.now(); };
  const makeAnswer = (ans: string): UserAnswer => ({
    questionId: questions[currentQuestionIndex].questionId, answer: ans,
    timeTaken: Math.round((Date.now() - questionStartRef.current) / 1000),
  });

  const advanceOrFinish = (newAnswers: UserAnswer[]) => {
    if (currentQuestionIndex < questions.length - 1) beginQuestion(currentQuestionIndex + 1);
    else finishTest(newAnswers);
  };

  const autoAdvance = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const next = [...userAnswers, makeAnswer(selectedAnswer || "unanswered")];
    setUserAnswers(next); advanceOrFinish(next);
  };

  const handleSkip = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const q   = questions[currentQuestionIndex];
    const sec = q?.section?.toLowerCase();
    // Record skipped writing/speaking so they appear in batch eval
    if (sec === "writing")  collectedWriting.current.push({ questionIndex: currentQuestionIndex, question: q.text, answer: "(skipped)", niveau: q.niveau });
    if (sec === "speaking") collectedSpeaking.current.push({ questionIndex: currentQuestionIndex, question: q.text, transcript: "(skipped)", skipped: true, sbResult: null, niveau: q.niveau });
    const next = [...userAnswers, makeAnswer("skipped")];
    setUserAnswers(next); advanceOrFinish(next);
  };

  const handleNext = () => {
    if (!selectedAnswer) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const q   = questions[currentQuestionIndex];
    const sec = q?.section?.toLowerCase();
    // Silently collect writing answer — no per-question eval
    if (sec === "writing") {
      collectedWriting.current.push({ questionIndex: currentQuestionIndex, question: q.text, answer: selectedAnswer, niveau: q.niveau });
    }
    const next = [...userAnswers, makeAnswer(selectedAnswer)];
    setUserAnswers(next); advanceOrFinish(next);
  };

  // Speaking — open recorder (no eval yet, just collect transcript)
  const handleSpeakingOpen = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    speakingTaskNumber.current += 1;
    setShowRecorder(true);
  };

  const handleSpeakingSubmit = async (webSpeechTranscript: string, blob: Blob | null) => {
    setShowRecorder(false);
    const q = questions[currentQuestionIndex];

    let transcript  = webSpeechTranscript.trim() || "";
    let sbResult: SpeechBrainEvalResult | null = null;

    if (blob) {
      try {
        setSbLoading(true);
        sbResult = await evaluateAudioWithSpeechBrain(blob);
        // Prefer SpeechBrain transcription (Whisper) — it's more accurate than Web Speech API
        const sbTranscript = (sbResult.transcription || sbResult.what_they_said || "").trim();
        if (sbTranscript.length > 3) {
          transcript = sbTranscript;
        }
      } catch (sbErr) {
        console.warn("[IELTS] SpeechBrain unavailable, using Web Speech transcript:", sbErr);
      } finally {
        setSbLoading(false);
      }
    }

    // Fall back to placeholder only if truly nothing was captured
    if (!transcript) transcript = "(no transcript)";

    collectedSpeaking.current.push({
      questionIndex: currentQuestionIndex,
      question:      q.text,
      transcript,
      niveau:        q.niveau,
      skipped:       false,
      sbResult,
    });

    const next = [...userAnswers, makeAnswer(transcript !== "(no transcript)"
      ? `[spoken: ${transcript.slice(0, 60)}…]`
      : "[spoken]"
    )];
    setUserAnswers(next);
    advanceOrFinish(next);
  };

  const handleSpeakingSkip = () => {
    setShowRecorder(false);
    const q = questions[currentQuestionIndex];
    collectedSpeaking.current.push({ questionIndex: currentQuestionIndex, question: q.text, transcript: "(skipped)", skipped: true, sbResult: null });
    const next = [...userAnswers, makeAnswer("skipped")];
    setUserAnswers(next); advanceOrFinish(next);
  };

  // ── Finish — batch eval then show results ──────────────────────────────────
  const finishTest = async (finalAnswers: UserAnswer[]) => {
    setStage("evaluating");
    setEvalError(null);

    // 1. Listening & Reading: count correct answers
    const scores: Record<string, { correct: number; total: number }> = {};
    questions.forEach((q, i) => {
      const s = q.section ?? "Unknown";
      if (!scores[s]) scores[s] = { correct: 0, total: 0 };
      scores[s].total++;
      if (finalAnswers[i]?.answer === q.correctAnswer) scores[s].correct++;
    });
    const withPct: Record<string, { correct: number; total: number; percentage: number }> = {};
    Object.entries(scores).forEach(([s, v]) => { withPct[s] = { ...v, percentage: Math.round((v.correct / v.total) * 100) }; });
    setSectionScores(withPct);

    // 2. Writing batch evaluation
    let wEval: SectionEval | null = null;
    console.log("[IELTS] GROQ_AVAILABLE:", GROQ_AVAILABLE, "speaking entries:", collectedSpeaking.current.length, "key:", OPENROUTER_API_KEY?.slice(0,12));
    const realWriting = collectedWriting.current.filter(e => e.answer && e.answer !== "(skipped)");
    if (GROQ_AVAILABLE && realWriting.length > 0) {
      try {
        setEvalStep("Evaluating all writing tasks…");
        const { aggregated: wAgg, sectionEval: wSectionEval } = await evaluateWritingBatch(realWriting);
        setWritingAggregated(wAgg);
        setWritingEval(wSectionEval);
        wEval = wSectionEval;
      } catch (err) {
        console.warn("[IELTS] Writing batch eval failed:", err);
        setEvalError("Writing AI evaluation failed — showing objective scores only.");
      }
    }

    // Wait after writing eval so rate limit window resets before speaking calls start
    if (GROQ_AVAILABLE && wEval && collectedSpeaking.current.length > 0) {
      setEvalStep("Waiting before speaking evaluation…");
      await new Promise(r => setTimeout(r, 12000));
    }

    let sEval: SectionEval | null = null;
    if (GROQ_AVAILABLE && collectedSpeaking.current.length > 0) {
      try {
        setEvalStep("Sending all speaking answers to LLaMA for content + speaking evaluation…");
        const { aggregated, sectionEval, enrichedEntries } = await evaluateSpeakingFull(collectedSpeaking.current);
        setSpeakingAggregated(aggregated);
        setSpeakingEval(sectionEval);
        enrichedSpeakingRef.current = enrichedEntries;
        sEval = sectionEval;
      } catch (err) {
        console.warn("[IELTS] Speaking full eval failed:", err);
        setEvalError("Speaking AI evaluation failed — showing objective scores only.");
      }
    } else if (collectedSpeaking.current.length > 0) {
      // No LLaMA: derive scores purely from SpeechBrain
      const enriched: CollectedSpeakingEntry[] = collectedSpeaking.current.map(e => {
        if (e.skipped) return { ...e, contentScore: 0, speakingScore: 0, finalScore: 0, contentFeedback: "Skipped" };
        const speakingScore = sbScoreToSpeakingScore(e.sbResult);
        return { ...e, contentScore: 0, speakingScore, finalScore: speakingScore, contentFeedback: "Content scoring requires OpenRouter API key." };
      });
      enrichedSpeakingRef.current = enriched;
      const totalScore  = enriched.reduce((s, e) => s + (e.finalScore ?? 0), 0);
      const attempted   = enriched.filter(e => !e.skipped);
      const maxPossible = 100; // Always 10 questions × 10 pts = 100
      const percentage  = Math.round((totalScore / maxPossible) * 100);
      setSpeakingAggregated({
        totalScore, maxPossible, percentage,
        bandScore: percentage >= 90 ? 9 : percentage >= 80 ? 8 : percentage >= 70 ? 7 : percentage >= 60 ? 6 : percentage >= 50 ? 5 : percentage >= 40 ? 4 : 3,
        skippedCount: enriched.filter(e => e.skipped).length,
        attemptedCount: attempted.length,
        perQuestion: enriched.map(e => ({ contentScore: 0, speakingScore: e.speakingScore ?? 0, finalScore: e.finalScore ?? 0, feedback: e.contentFeedback ?? "" })),
      });
    }

    // 4. Save to DB
    if (isAuthenticated) {
      const totalCorrect = Object.values(withPct).reduce((a, x) => a + x.correct, 0);
      const writingBand  = wEval?.bandScore ?? null;
      const speakingBand = sEval?.bandScore ?? null;
      try {
        await submitResult.mutateAsync({
          skill: "ielts",
          score: Math.round((totalCorrect / finalAnswers.length) * 100),
          totalQuestions: finalAnswers.length,
          correctAnswers: totalCorrect,
          timeTaken: Math.round((Date.now() - testStartRef.current) / 1000),
          answers: finalAnswers.map((a) => ({
            questionId: a.questionId,
            answer: a.answer,
            timeTaken: a.timeTaken,
          })),
        });

        // Save Writing feedback from LLaMA
        if (wEval) {
          await saveFeedback.mutateAsync({
            skill:           "Writing",
            source:          "llama",
            overallBand:     wEval.bandScore,
            overallFeedback: wEval.overallFeedback,
            perQuestion:     wEval.perQuestion,
          }).catch(e => console.error("[IELTS] Save writing feedback failed:", e));
        }

        // Save Speaking feedback from LLaMA + SpeechBrain
        if (sEval) {
          await saveFeedback.mutateAsync({
            skill:           "Speaking",
            source:          "combined",
            overallBand:     sEval.bandScore,
            overallFeedback: sEval.overallFeedback,
            perQuestion:     sEval.perQuestion,
          }).catch(e => console.error("[IELTS] Save speaking feedback failed:", e));
        }
      } catch (e) { console.warn("[IELTS] Save failed:", e); }
    }

    setStage("results");
  };

  const handleRetake = () => {
    setWritingEval(null); setWritingAggregated(null); setSpeakingEval(null);
    setSpeakingAggregated(null);
    enrichedSpeakingRef.current = [];
    setShowWritingModal(false); setShowSpeakingModal(false);
    loadQuestions();
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const currentQuestion = questions[currentQuestionIndex];
  const currentSection  = currentQuestion?.section?.toLowerCase() ?? "";
  const isSpeaking      = currentSection === "speaking";
  const isWriting       = currentSection === "writing";
  const isListening     = currentSection === "listening";
  const isTextInput     = currentQuestion?.correctAnswer === "text" || isWriting;
  const timerColor      = timeRemaining <= 10 ? "text-red-500" : "text-cyan-400";
  const sectionsOrder   = ["Listening","Reading","Writing","Speaking"];
  const sectionColors: Record<string, string> = {
    Listening: "from-blue-400 to-cyan-500",
    Reading:   "from-green-400 to-emerald-500",
    Writing:   "from-purple-400 to-pink-500",
    Speaking:  "from-orange-400 to-red-500",
  };
  const currentColor = sectionColors[currentQuestion?.section] ?? "from-orange-400 to-red-500";
  const sectionIdx   = sectionsOrder.indexOf(currentQuestion?.section ?? "");

  // ── Unauthenticated ────────────────────────────────────────────────────────
  if (!isAuthenticated) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0a0f1e" }}>
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4 text-white">Please log in to take the IELTS test</h1>
        <button onClick={() => navigate("/test")} className="px-6 py-2 bg-cyan-500 text-white rounded-lg font-semibold hover:bg-cyan-600 transition-colors">Back to Tests</button>
      </div>
    </div>
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (stage === "loading") return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0a0f1e" }}>
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-cyan-400 mx-auto mb-4" />
        <p className="text-white text-lg">Preparing your IELTS test…</p>
        <p className="text-white/40 text-sm mt-2">80 questions · 4 sections</p>
      </div>
    </div>
  );

  // ── Evaluating (batch) ─────────────────────────────────────────────────────
  if (stage === "evaluating") return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0a0f1e" }}>
      <div className="text-center max-w-sm px-6">
        <Loader2 className="w-14 h-14 animate-spin text-orange-400 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-white mb-2">Calculating your results…</h2>
        <p className="text-orange-400 text-sm font-semibold mb-1">{evalStep}</p>
        <p className="text-white/30 text-xs">OpenRouter AI is reading all your answers together to give one holistic score per section — just like a real IELTS examiner.</p>
      </div>
    </div>
  );

  // ── Results ────────────────────────────────────────────────────────────────
  if (stage === "results") {
    // pctToScore: convert percentage to 0–10 score (0% = 0, 100% = 10)
    const pctToScore = (p: number): number => Math.round(p / 10);

    // Compute weighted score (0–10) for a section using CEFR difficulty weights
    const weightedScore = (sectionName: string): number => {
      const sectionQs = questions.filter(q => q.section === sectionName);
      if (sectionQs.length === 0) return 0;
      let weightedCorrect = 0;
      let weightedTotal   = 0;
      sectionQs.forEach((q) => {
        const w   = niveauWeight(q.niveau);
        const ans = userAnswers.find(a => a.questionId === q.questionId);
        weightedTotal   += w;
        if (ans?.answer === q.correctAnswer) weightedCorrect += w;
      });
      const weightedPct = Math.round((weightedCorrect / weightedTotal) * 100);
      return pctToScore(weightedPct);
    };

    const listeningScore = weightedScore("Listening");   // 0–10
    const readingScore   = weightedScore("Reading");     // 0–10
    // Writing score: average of per-question LLaMA scores (0–10), or fallback from percentage
    const writingScore   = writingAggregated
      ? writingAggregated.averageScore
      : pctToScore(sectionScores["Writing"]?.percentage ?? 0);
    // Speaking score: total/100 → 0–10
    const speakingScore  = speakingAggregated
      ? Math.round(speakingAggregated.totalScore / 10)
      : pctToScore(sectionScores["Speaking"]?.percentage ?? 0);
    const overallScore   = Math.round(((listeningScore + readingScore + writingScore + speakingScore) / 4) * 10) / 10;

    const bandCards = [
      { section: "Listening", score: listeningScore, color: sectionColors["Listening"], eval: null,        hasAI: false },
      { section: "Reading",   score: readingScore,   color: sectionColors["Reading"],   eval: null,        hasAI: false },
      { section: "Writing",   score: writingScore,   color: sectionColors["Writing"],   eval: writingEval,  hasAI: !!writingEval },
      { section: "Speaking",  score: speakingScore,  color: sectionColors["Speaking"],  eval: speakingEval, hasAI: !!speakingEval },
    ];

    return (
      <div className="min-h-screen text-white overflow-hidden" style={{ backgroundColor: "#0a0f1e" }}>
        <div className="fixed top-[-200px] right-[-100px] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 blur-[120px] opacity-20 z-0 pointer-events-none" />
        <div className="fixed bottom-[-200px] left-[-100px] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-cyan-500 via-blue-500 to-indigo-500 blur-[120px] opacity-20 z-0 pointer-events-none" />

        {/* Writing modal */}
        {showWritingModal && writingEval && (
          <FinalEvalModal section="Writing" result={writingEval} bandColor={sectionColors["Writing"]} onClose={() => setShowWritingModal(false)} />
        )}
        {/* Speaking modal */}
        {showSpeakingModal && speakingEval && (
          <FinalEvalModal section="Speaking" result={speakingEval} bandColor={sectionColors["Speaking"]} onClose={() => setShowSpeakingModal(false)} />
        )}

        <main className="relative z-10 p-8 max-w-4xl mx-auto">
          {evalError && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm text-center">{evalError}</div>
          )}

          <div className="text-center mb-10">
            <h1 className="text-4xl font-extrabold mb-2 bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">IELTS Test Complete!</h1>
            <p className="text-white/50">Your full results are ready</p>
          </div>

          {/* Overall band score */}
          <div className="glass-card rounded-[2rem] p-8 border border-white/10 mb-8 text-center">
            <p className="text-white/40 text-sm uppercase tracking-widest mb-2">Overall Score</p>
            <div className="text-8xl font-black bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent mb-2">{overallScore}<span className="text-4xl text-white/30">/10</span></div>
            <p className="text-white/50 text-sm">Average of all four sections</p>
            {isAuthenticated && <p className="text-green-400 text-sm mt-3">✓ Results saved to your profile</p>}
          </div>

          {/* Section cards */}
          <h2 className="text-2xl font-bold mb-5 text-white">Section Scores</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
            {bandCards.map(({ section, score, color, eval: ev, hasAI }) => {
              const sectionData = sectionScores[section];
              return (
                <div key={section} className="glass-card rounded-[2rem] p-6 border border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-white text-lg">{section}</h3>
                    <div className="text-right">
                      <div className={`text-3xl font-black bg-gradient-to-r ${color} bg-clip-text text-transparent`}>{score}<span className="text-lg text-white/30">/10</span></div>
                    </div>
                  </div>

                  {sectionData && (section === "Listening" || section === "Reading") && (
                    <p className="text-sm text-white/50 mb-3">
                      {sectionData.correct} correct · {sectionData.total} questions ·{" "}
                      <span className="font-bold text-white/70">
                        {Math.round(sectionData.correct / sectionData.total * 10 * 10) / 10}/10 pts
                      </span>
                    </p>
                  )}

                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden mb-3">
                    <div className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-700`} style={{ width: `${(score / 10) * 100}%` }} />
                  </div>

                  {hasAI && ev ? (
                    <button
                      onClick={() => { if (section === "Writing") setShowWritingModal(true); else setShowSpeakingModal(true); }}
                      className={`w-full mt-2 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                        section === "Writing"
                          ? "border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                          : "border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                      }`}
                    >
                      <Star size={11} fill="currentColor" /> View AI Feedback & Remarks
                    </button>
                  ) : (section === "Writing" || section === "Speaking") && !GROQ_AVAILABLE ? (
                    <p className="text-xs text-white/25 mt-2 text-center italic">Add VITE_OPENROUTER_API_KEY to enable AI evaluation</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Score legend */}
          <div className="glass-card rounded-2xl p-5 border border-white/10 mb-8">
            <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Score Reference (0 – 10)</p>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center text-xs">
              {[["9-10","Excellent"],["7-8","Good"],["5-6","Adequate"],["3-4","Weak"],["1-2","Very Poor"],["0","No Answer"]].map(([range, label]) => {
                const low = parseInt(range.split("-")[0]);
                const isOverall = overallScore >= low && overallScore < (low + 2 > 10 ? 11 : low + 2);
                return (
                  <div key={range} className={`p-2 rounded-lg border border-white/10 ${isOverall ? "bg-orange-500/20 border-orange-500/40" : "bg-white/5"}`}>
                    <div className={`text-lg font-black ${isOverall ? "text-orange-400" : "text-white/50"}`}>{range}</div>
                    <div className="text-white/30 leading-tight">{label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Writing per-question breakdown ── */}
          {writingAggregated && writingAggregated.perQuestion.length > 0 && (() => {
            const wAgg = writingAggregated;
            const realEntries = collectedWriting.current.filter(e => e.answer && e.answer !== "(skipped)");
            const scoreColor = (s: number) =>
              s >= 7 ? "from-emerald-400 to-green-500" : s >= 5 ? "from-orange-400 to-amber-500" : "from-red-400 to-rose-500";

            return (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <h2 className="text-2xl font-bold text-white">Writing — Detailed Score Breakdown</h2>
                  <div className="flex gap-3">
                    <div className="glass-card rounded-xl px-4 py-2 border border-purple-500/25 text-center">
                      <div className="text-xl font-black text-purple-400">{wAgg.totalScore}<span className="text-sm text-white/30">/{wAgg.maxPossible}</span></div>
                      <div className="text-xs text-white/30">total pts</div>
                    </div>
                    <div className="glass-card rounded-xl px-4 py-2 border border-cyan-500/25 text-center">
                      <div className="text-xl font-black text-cyan-400">{wAgg.percentage}%</div>
                      <div className="text-xs text-white/30">score</div>
                    </div>
                  </div>
                </div>

                {/* Legend */}
                <div className="glass-card rounded-xl p-4 border border-white/10 mb-5 text-xs text-white/50">
                  <span className="w-3 h-3 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 inline-block mr-2" />
                  <strong className="text-purple-300">Content Score (0–10):</strong> Assessed by LLaMA — task achievement, vocabulary, grammar, coherence
                </div>

                <div className="space-y-4">
                  {wAgg.perQuestion.map((qs, idx) => {
                    const entry = realEntries[idx];
                    const pct   = (qs.score / 10) * 100;
                    return (
                      <div key={idx} className="glass-card rounded-2xl p-6 border border-white/10">
                        <div className="flex items-start gap-4 mb-3">
                          {/* Score circle */}
                          <div className="shrink-0 text-center">
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-br ${scoreColor(qs.score)} shadow-lg`}>
                              <span className="text-white font-black text-xl leading-none">{qs.score}</span>
                            </div>
                            <p className="text-xs text-white/30 mt-1">/10 pts</p>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-white/40 font-semibold block mb-1">Task {idx + 1}</span>
                            <p className="text-white/70 text-sm leading-relaxed line-clamp-2">{entry?.question ?? `Writing Task ${idx + 1}`}</p>
                          </div>
                        </div>
                        {/* Score bar */}
                        <div className="h-2 w-full bg-white/10 rounded-full mb-3 overflow-hidden">
                          <div className={`h-full rounded-full bg-gradient-to-r ${scoreColor(qs.score)} transition-all duration-700`} style={{ width: `${pct}%` }} />
                        </div>
                        {/* Feedback */}
                        {qs.feedback && (
                          <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/15">
                            <p className="text-xs font-bold text-purple-400/70 uppercase tracking-wider mb-1">Feedback (LLaMA)</p>
                            <p className="text-xs text-white/70 leading-relaxed">{qs.feedback}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Writing score summary */}
                <div className="mt-5 glass-card rounded-2xl p-5 border border-white/10">
                  <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Writing Score Summary</p>
                  <div className="grid grid-cols-3 gap-4 text-center text-sm">
                    <div>
                      <p className="text-2xl font-black text-purple-300">{wAgg.totalScore}<span className="text-sm text-white/30">/{wAgg.maxPossible}</span></p>
                      <p className="text-xs text-white/30 mt-0.5">Total Points</p>
                    </div>
                    <div>
                      <p className="text-2xl font-black text-cyan-300">{wAgg.averageScore}<span className="text-sm text-white/30">/10</span></p>
                      <p className="text-xs text-white/30 mt-0.5">Average Score</p>
                    </div>
                    <div>
                      <p className="text-2xl font-black text-emerald-300">{wAgg.percentage}%</p>
                      <p className="text-xs text-white/30 mt-0.5">Final %</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Speaking per-question breakdown (Enhanced: Content + Speaking scores) ── */}
          {(() => {
            const displayEntries = enrichedSpeakingRef.current.length > 0
              ? enrichedSpeakingRef.current
              : collectedSpeaking.current;
            if (displayEntries.length === 0) return null;

            const agg = speakingAggregated;
            const attempted = displayEntries.filter(e => !e.skipped && e.transcript !== "(skipped)");

            const fluencyColor = (level: string) => {
              switch (level) {
                case "excellent": return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
                case "good":      return "text-cyan-400   border-cyan-500/30   bg-cyan-500/10";
                case "fair":      return "text-amber-400  border-amber-500/30  bg-amber-500/10";
                default:          return "text-red-400    border-red-500/30    bg-red-500/10";
              }
            };
            const scoreColor = (s: number) =>
              s >= 75 ? "from-emerald-400 to-green-500" : s >= 50 ? "from-orange-400 to-amber-500" : "from-red-400 to-rose-500";

            return (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <h2 className="text-2xl font-bold text-white">Speaking — Detailed Score Breakdown</h2>
                  {agg && (
                    <div className="flex gap-3">
                      <div className="glass-card rounded-xl px-4 py-2 border border-orange-500/25 text-center">
                        <div className="text-xl font-black text-orange-400">{agg.totalScore}<span className="text-sm text-white/30">/100</span></div>
                        <div className="text-xs text-white/30">total pts</div>
                      </div>
                      <div className="glass-card rounded-xl px-4 py-2 border border-cyan-500/25 text-center">
                        <div className="text-xl font-black text-cyan-400">{agg.percentage}%</div>
                        <div className="text-xs text-white/30">score</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Score legend */}
                <div className="glass-card rounded-xl p-4 border border-white/10 mb-5 flex flex-wrap gap-4 text-xs text-white/50">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 inline-block" />
                    <span><strong className="text-purple-300">Content Score</strong> (0–4): Assessed by LLaMA — how well you answered the question</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-gradient-to-br from-orange-400 to-red-500 inline-block" />
                    <span><strong className="text-orange-300">Speaking Score</strong> (0–6): From SpeechBrain — fluency, clarity, pace</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 inline-block" />
                    <span><strong className="text-cyan-300">Final Score</strong> (0–10): Content + Speaking combined. Skipped = 0 pts</span>
                  </div>
                </div>

                <div className="space-y-4">
                  {displayEntries.map((entry, idx) => {
                    const r    = entry.sbResult;
                    const qNum = idx + 1;
                    const isSkipped = entry.skipped || entry.transcript === "(skipped)";

                    if (isSkipped) {
                      return (
                        <div key={idx} className="glass-card rounded-2xl p-5 border border-white/10 flex items-center gap-4 opacity-50">
                          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/30 font-bold text-sm shrink-0">{qNum}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white/50 line-clamp-1">{entry.question}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="px-3 py-1 rounded-full text-xs font-bold border border-amber-500/30 bg-amber-500/10 text-amber-400">Skipped</span>
                            <p className="text-xs text-white/30 mt-1">0 / 10 pts</p>
                          </div>
                        </div>
                      );
                    }

                    const contentScore  = entry.contentScore  ?? 0;
                    const speakingScore = entry.speakingScore ?? (r ? Math.round(sbScoreToSpeakingScore(r)) : 0);
                    const finalScore    = entry.finalScore    ?? (contentScore + speakingScore);
                    const finalPct      = (finalScore / 10) * 100;

                    return (
                      <div key={idx} className="glass-card rounded-2xl p-6 border border-white/10">
                        <div className="flex items-start gap-4 mb-4">
                          {/* Final score circle */}
                          <div className="shrink-0 text-center">
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-br ${scoreColor(finalPct)} shadow-lg`}>
                              <div className="text-center">
                                <span className="text-white font-black text-xl leading-none">{finalScore}</span>
                              </div>
                            </div>
                            <p className="text-xs text-white/30 mt-1">/10 pts</p>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-xs text-white/40 font-semibold">Q{qNum}</span>
                              {r && <span className={`px-2 py-0.5 rounded-full text-xs font-bold border capitalize ${fluencyColor(r.fluency_level)}`}>{r.fluency_level}</span>}
                              {r && <span className="text-xs text-white/30">{r.duration_seconds.toFixed(1)}s · {r.word_count} words</span>}
                            </div>
                            <p className="text-white/70 text-sm leading-relaxed mb-2">{entry.question}</p>
                            {(r?.transcription || r?.what_they_said || entry.transcript) && (
                              <p className="text-xs text-cyan-400/70 italic line-clamp-2">
                                "{(r?.transcription || r?.what_they_said || entry.transcript || "").toLowerCase()}"
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Score breakdown bars */}
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          {/* Content score */}
                          <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-center">
                            <p className="text-xs text-purple-300/70 font-semibold mb-1">Content</p>
                            <div className="flex justify-center gap-1 mb-1">
                              {[0,1,2,3,4].map(i => (
                                <div key={i} className={`h-2 flex-1 rounded-full ${i < contentScore ? "bg-purple-400" : "bg-white/10"}`} />
                              ))}
                            </div>
                            <p className="text-lg font-black text-purple-300">{contentScore}<span className="text-xs text-white/30">/4</span></p>
                          </div>

                          {/* Speaking score */}
                          <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-center">
                            <p className="text-xs text-orange-300/70 font-semibold mb-1">Speaking</p>
                            <div className="flex justify-center gap-1 mb-1">
                              {[0,1,2,3,4,5,6].map(i => (
                                <div key={i} className={`h-2 flex-1 rounded-full ${i < speakingScore ? "bg-orange-400" : "bg-white/10"}`} />
                              ))}
                            </div>
                            <p className="text-lg font-black text-orange-300">{speakingScore}<span className="text-xs text-white/30">/6</span></p>
                          </div>

                          {/* Final score */}
                          <div className={`p-3 rounded-xl border text-center ${finalScore >= 7 ? "bg-emerald-500/10 border-emerald-500/20" : finalScore >= 4 ? "bg-amber-500/10 border-amber-500/20" : "bg-red-500/10 border-red-500/20"}`}>
                            <p className={`text-xs font-semibold mb-1 ${finalScore >= 7 ? "text-emerald-300/70" : finalScore >= 4 ? "text-amber-300/70" : "text-red-300/70"}`}>Final</p>
                            <div className="h-2 w-full bg-white/10 rounded-full mb-1 overflow-hidden">
                              <div className={`h-full rounded-full bg-gradient-to-r ${scoreColor(finalPct)}`} style={{ width: `${finalPct}%` }} />
                            </div>
                            <p className={`text-lg font-black ${finalScore >= 7 ? "text-emerald-300" : finalScore >= 4 ? "text-amber-300" : "text-red-300"}`}>{finalScore}<span className="text-xs text-white/30">/10</span></p>
                          </div>
                        </div>

                        {/* Content feedback from LLaMA */}
                        {entry.contentFeedback && entry.contentFeedback !== "Skipped" && (
                          <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/15 mb-3">
                            <p className="text-xs font-bold text-purple-400/70 uppercase tracking-wider mb-1">Content Feedback (LLaMA)</p>
                            <p className="text-xs text-white/70 leading-relaxed">{entry.contentFeedback}</p>
                          </div>
                        )}

                        {/* SpeechBrain feedback */}
                        {r?.feedback && (
                          <div className="p-3 rounded-xl bg-white/5 border border-white/10 mb-3">
                            <p className="text-xs font-bold text-orange-400/70 uppercase tracking-wider mb-1">Speaking Feedback (SpeechBrain)</p>
                            <p className="text-xs text-white/70 leading-relaxed">{r.feedback}</p>
                          </div>
                        )}

                        {/* Suggestions */}
                        {r?.suggestions && r.suggestions.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {r.suggestions.map((s, si) => (
                              <span key={si} className="px-2.5 py-1 rounded-full text-xs border border-orange-500/30 bg-orange-500/10 text-orange-300">{s}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {agg && agg.skippedCount > 0 && (
                  <p className="text-xs text-white/30 text-center mt-3 italic">{agg.skippedCount} question{agg.skippedCount > 1 ? "s" : ""} skipped — 0 points awarded per skipped task</p>
                )}

                {/* Score summary */}
                {agg && (
                  <div className="mt-5 glass-card rounded-2xl p-5 border border-white/10">
                    <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Speaking Score Summary</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-sm">
                      <div>
                        <p className="text-2xl font-black text-purple-300">{agg.perQuestion.reduce((s,q)=>s+q.contentScore,0)}<span className="text-sm text-white/30">/{agg.attemptedCount * 4}</span></p>
                        <p className="text-xs text-white/30 mt-0.5">Total Content</p>
                      </div>
                      <div>
                        <p className="text-2xl font-black text-orange-300">{agg.perQuestion.reduce((s,q)=>s+q.speakingScore,0)}<span className="text-sm text-white/30">/{agg.attemptedCount * 6}</span></p>
                        <p className="text-xs text-white/30 mt-0.5">Total Speaking</p>
                      </div>
                      <div>
                        <p className="text-2xl font-black text-cyan-300">{agg.totalScore}<span className="text-sm text-white/30">/100</span></p>
                        <p className="text-xs text-white/30 mt-0.5">Total Points</p>
                      </div>
                      <div>
                        <p className="text-2xl font-black text-emerald-300">{agg.percentage}%</p>
                        <p className="text-xs text-white/30 mt-0.5">Final %</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Question Review (numbered boxes) ── */}
          {(() => {
            const reviewSections = ["Listening", "Reading", "Writing", "Speaking"];
            const toggleQ = (id: number) => {
              setExpandedReviewQ(prev => {
                const next = new Set(prev);
                next.has(id) ? next.delete(id) : next.add(id);
                return next;
              });
            };
            return (
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-white mb-5">Question Review</h2>
                {reviewSections.map((sec) => {
                  const secQs = questions.filter(q => q.section === sec);
                  if (secQs.length === 0) return null;
                  const isMCQ = sec === "Listening" || sec === "Reading";
                  const isWrite = sec === "Writing";
                  const isSpeak = sec === "Speaking";
                  return (
                    <div key={sec} className="mb-6">
                      <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-3 bg-gradient-to-r ${sectionColors[sec]} text-white`}>
                        {sec === "Listening" && <Headphones size={12} />}
                        {sec === "Reading" && <BookOpen size={12} />}
                        {sec === "Writing" && "📝"}
                        {sec === "Speaking" && <Mic size={12} />}
                        {sec}
                      </div>

                      {/* Number grid */}
                      <div className="flex flex-wrap gap-2 mb-3">
                        {secQs.map((q, qi) => {
                          const ua = userAnswers.find(a => a.questionId === q.questionId);
                          const userAns = ua?.answer ?? "skipped";
                          const isSkipped = !ua || userAns === "skipped";
                          const isOpen = expandedReviewQ.has(q.questionId);

                          let boxCls = "w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold cursor-pointer border transition-all ";
                          if (isMCQ) {
                            if (!isSkipped && userAns === q.correctAnswer) boxCls += "bg-emerald-500/20 border-emerald-500/40 text-emerald-400";
                            else if (!isSkipped) boxCls += "bg-red-500/25 border-red-500/50 text-red-400";
                            else boxCls += "bg-white/5 border-white/15 text-white/35";
                          } else if (isWrite) {
                            const wEntry = collectedWriting.current.find(e => questions[e.questionIndex]?.questionId === q.questionId);
                            const hasAns = wEntry?.answer && wEntry.answer !== "skipped" && wEntry.answer !== "(skipped)";
                            boxCls += hasAns ? "bg-purple-500/20 border-purple-500/40 text-purple-400" : "bg-white/5 border-white/15 text-white/35";
                          } else if (isSpeak) {
                            const sEntry = (enrichedSpeakingRef.current.length > 0 ? enrichedSpeakingRef.current : collectedSpeaking.current)
                              .find(e => questions[e.questionIndex]?.questionId === q.questionId);
                            const skipped = sEntry?.skipped || sEntry?.transcript === "(skipped)" || isSkipped;
                            boxCls += skipped ? "bg-white/5 border-white/15 text-white/35" : "bg-orange-500/20 border-orange-500/40 text-orange-400";
                          }
                          if (isOpen) boxCls += " ring-2 ring-white/30";

                          return (
                            <button key={q.questionId} onClick={() => toggleQ(q.questionId)} className={boxCls} title={`Question ${qi + 1}`}>
                              {qi + 1}
                            </button>
                          );
                        })}
                      </div>

                      {/* Expanded detail panels */}
                      <div className="space-y-2">
                        {secQs.map((q, qi) => {
                          if (!expandedReviewQ.has(q.questionId)) return null;
                          const ua = userAnswers.find(a => a.questionId === q.questionId);
                          const userAns = ua?.answer ?? "skipped";
                          const isSkipped = !ua || userAns === "skipped";

                          return (
                            <div key={q.questionId} className="glass-card rounded-2xl p-5 border border-white/10">
                              <p className="text-xs font-bold text-white/40 mb-2">Q{qi + 1}</p>
                              <p className="text-sm text-white/85 leading-relaxed mb-3">{q.text}</p>

                              {isMCQ && (() => {
                                const correctIdx = q.correctAnswer.charCodeAt(0) - 65;
                                const correctText = q.options[correctIdx] ?? q.correctAnswer;
                                return (
                                  <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {q.options.filter(o => o !== "").map((opt, oi) => {
                                        const key = String.fromCharCode(65 + oi);
                                        const isCorrectOpt = key === q.correctAnswer;
                                        const isUserOpt = key === userAns;
                                        let cls = "px-3 py-2 rounded-xl text-xs border flex items-center gap-2 ";
                                        if (isCorrectOpt && isUserOpt) cls += "bg-emerald-500/15 border-emerald-500/40 text-emerald-300";
                                        else if (isCorrectOpt) cls += "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
                                        else if (isUserOpt) cls += "bg-red-500/15 border-red-500/40 text-red-300";
                                        else cls += "bg-white/5 border-white/10 text-white/50";
                                        return (
                                          <div key={oi} className={cls}>
                                            <span className="font-bold w-4 shrink-0">{key}</span>
                                            <span>{opt}</span>
                                            {isCorrectOpt && <CheckCircle size={12} className="ml-auto shrink-0 text-emerald-400" />}
                                            {isUserOpt && !isCorrectOpt && <X size={12} className="ml-auto shrink-0 text-red-400" />}
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {isSkipped && <p className="mt-2 text-xs text-amber-400/70 italic">Skipped — correct: <strong>{q.correctAnswer}</strong> · {correctText}</p>}
                                  </>
                                );
                              })()}

                              {isWrite && (() => {
                                const wEntry = collectedWriting.current.find(e => questions[e.questionIndex]?.questionId === q.questionId);
                                const answer = wEntry?.answer ?? userAns;
                                const wScore = writingAggregated?.perQuestion.find(p => questions[p.questionIndex]?.questionId === q.questionId);
                                return (
                                  <>
                                    {answer && answer !== "skipped" && answer !== "(skipped)" ? (
                                      <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20">
                                        <p className="text-xs font-bold text-purple-400/60 uppercase tracking-wider mb-1">Your Answer</p>
                                        <p className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap">{answer}</p>
                                      </div>
                                    ) : <p className="text-xs text-amber-400/70 italic">No answer provided</p>}
                                    {wScore && <span className={`mt-2 inline-block px-2 py-0.5 rounded-full text-xs font-bold ${wScore.score >= 7 ? "bg-emerald-500/15 text-emerald-400" : wScore.score >= 5 ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400"}`}>Score: {wScore.score}/10</span>}
                                  </>
                                );
                              })()}

                              {isSpeak && (() => {
                                const sEntry = (enrichedSpeakingRef.current.length > 0 ? enrichedSpeakingRef.current : collectedSpeaking.current)
                                  .find(e => questions[e.questionIndex]?.questionId === q.questionId);
                                const transcript = sEntry?.transcript ?? userAns;
                                const skipped = sEntry?.skipped || transcript === "(skipped)" || isSkipped;
                                return skipped ? (
                                  <p className="text-xs text-amber-400/70 italic">Skipped</p>
                                ) : (
                                  <div className="p-3 rounded-xl bg-orange-500/5 border border-orange-500/20">
                                    <p className="text-xs font-bold text-orange-400/60 uppercase tracking-wider mb-1">Your Transcript</p>
                                    <p className="text-xs text-white/70 italic">"{transcript}"</p>
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <div className="flex gap-4 justify-center">
            <button onClick={() => navigate("/test")} className="px-8 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30 transition-all">Back to Tests</button>
            <button onClick={handleRetake} className="px-8 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-orange-400 to-red-500 hover:shadow-lg hover:shadow-orange-500/30 transition-all">Retake Test</button>
          </div>
        </main>
        <style>{`.glass-card{background:rgba(71,98,150,.35);backdrop-filter:blur(24px);border-top:1px solid rgba(147,172,216,.15);border-left:1px solid rgba(147,172,216,.15)}`}</style>
      </div>
    );
  }

  // ── Test in progress ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen text-white overflow-hidden" style={{ backgroundColor: "#0a0f1e" }}>
      <div className="fixed top-[-200px] right-[-100px] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 blur-[120px] opacity-20 z-0 pointer-events-none" />
      <div className="fixed bottom-[-200px] left-[-100px] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-cyan-500 via-blue-500 to-indigo-500 blur-[120px] opacity-20 z-0 pointer-events-none" />

      {/* SpeechBrain processing toast (shows while transcribing in background) */}
      {sbLoading && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-2xl border border-purple-500/30 bg-purple-500/15 backdrop-blur-sm">
          <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
          <span className="text-sm font-semibold text-purple-300">Evaluating speech…</span>
          <span className="text-xs text-purple-400/60">scoring your answer</span>
        </div>
      )}

      {/* Speaking recorder */}
      {showRecorder && currentQuestion && (
        <SpeakingRecorderModal
          question={currentQuestion.text}
          taskNumber={speakingTaskNumber.current}
          totalTasks={20}
          onSubmit={handleSpeakingSubmit}
          onSkip={handleSpeakingSkip}
        />
      )}

      <main className="relative z-10 p-6 max-w-4xl mx-auto">
        {usingFallback && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs text-center">
            ℹ️ Using built-in questions — connect the IELTS backend for AI-generated questions
          </div>
        )}

        {/* Section tabs */}
        <div className="flex gap-2 mb-5">
          {sectionsOrder.map((s, i) => (
            <div key={s} className={`flex-1 py-1.5 text-center text-xs font-semibold rounded-full border transition-all ${
              i === sectionIdx ? `bg-gradient-to-r ${sectionColors[s]} text-white border-transparent`
              : i < sectionIdx ? "bg-white/10 text-white/40 border-white/10"
              : "bg-transparent text-white/30 border-white/10"}`}>{s}</div>
          ))}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className={`text-2xl font-extrabold bg-gradient-to-r ${currentColor} bg-clip-text text-transparent`}>{currentQuestion?.section}</h1>
            <p className="text-white/40 text-sm mt-0.5">
              Question {currentQuestionIndex + 1} / {questions.length}&nbsp;·&nbsp;
              {(() => {
                const sec = currentQuestion?.section ?? "";
                const sectionQs = questions.filter(q => q.section === sec);
                const posInSection = sectionQs.findIndex(q => q.questionId === currentQuestion?.questionId) + 1;
                return `${posInSection} of ${sectionQs.length} in section`;
              })()}
              {(isSpeaking || isWriting) && <span className="ml-2 text-white/25">· answers collected, evaluated at the end</span>}
            </p>
          </div>
          <div className="glass-card rounded-2xl px-5 py-3 border border-white/10 text-center">
            <div className={`text-3xl font-black tabular-nums ${timerColor}`}>{Math.floor(timeRemaining/60)}:{String(timeRemaining%60).padStart(2,"0")}</div>
            <p className="text-xs text-white/40 mt-0.5">remaining</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-5 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
          <div className={`h-full bg-gradient-to-r ${currentColor} rounded-full transition-all duration-300`} style={{ width: `${((currentQuestionIndex+1)/questions.length)*100}%` }} />
        </div>

        {/* Passage panel */}
        <PassagePanel
          section={currentQuestion?.section ?? ""}
          sourceTitle={currentQuestion?.sourceTitle}
          sourceContent={isListening ? undefined : currentQuestion?.sourceContent}
          sourceImageUrl={isListening ? undefined : currentQuestion?.sourceImageUrl}
          audioUrl={isListening ? (currentQuestion?.sourceAudioUrl ?? currentQuestion?.audioUrl) : undefined}
          niveau={currentQuestion?.niveau ?? undefined}
          passageText={isListening ? undefined : currentQuestion?.passageText}
        />

        {/* Question card */}
        <div className="glass-card rounded-[2rem] p-7 border border-white/10 mb-5">

          {/* Writing / Speaking info badge */}
          {(isWriting || isSpeaking) && (
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-4 border ${
              isWriting ? "bg-purple-500/20 text-purple-400 border-purple-500/30" : "bg-orange-500/20 text-orange-400 border-orange-500/30"
            }`}>
              {isWriting ? "📝 Answer saved — all writing evaluated together at the end"
                        : <><Mic size={11} /> Answer recorded — all speaking evaluated together at the end</>}
            </div>
          )}

          <p className="text-white font-semibold text-lg leading-relaxed mb-6">{currentQuestion?.text}</p>

          {/* Speaking — open recorder */}
          {isSpeaking ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <button onClick={handleSpeakingOpen} className="flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-orange-400 to-red-500 text-white font-semibold hover:shadow-lg hover:shadow-orange-500/30 transition-all">
                <Mic size={18} /> Open Recorder
              </button>
              <button onClick={handleSkip} className="text-xs text-white/25 hover:text-white/50 underline transition-colors">Skip this task</button>
            </div>

          ) : !isTextInput ? (
            /* Multiple choice */
            <div className="space-y-3 mb-6">
              {currentQuestion?.options.filter(o => o !== "").map((option, i) => {
                const key = String.fromCharCode(65 + i);
                const sel = selectedAnswer === key;
                return (
                  <label key={i} className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${sel ? `border-orange-400 bg-orange-500/10` : "bg-white/5 border-white/10 hover:border-white/25 hover:bg-white/10"}`}>
                    <input type="radio" name="answer" value={key} checked={sel} onChange={e => setSelectedAnswer(e.target.value)} className="w-5 h-5 cursor-pointer accent-orange-400" />
                    <span className={`font-bold text-sm w-5 ${sel ? "text-orange-400" : "text-white/40"}`}>{key}</span>
                    <span className={sel ? "text-white" : "text-white/80"}>{option}</span>
                  </label>
                );
              })}
            </div>

          ) : (
            /* Writing textarea */
            <textarea
              value={selectedAnswer}
              onChange={e => setSelectedAnswer(e.target.value)}
              placeholder="Write your answer here…"
              className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/25 focus:border-purple-400 focus:outline-none resize-none h-40 mb-6"
            />
          )}

          {!isSpeaking && (
            <div className="flex gap-3">
              <button onClick={handleSkip} className="px-6 py-3 rounded-xl font-semibold text-white/40 bg-white/5 border border-white/10 hover:bg-white/10 transition-all">Skip</button>
              <button
                onClick={handleNext}
                disabled={!selectedAnswer}
                className={`flex-1 py-3 rounded-xl font-semibold text-white transition-all ${selectedAnswer ? `bg-gradient-to-r ${currentColor} hover:opacity-90 hover:shadow-lg` : "bg-gray-700 opacity-40 cursor-not-allowed"}`}
              >
                {currentQuestionIndex === questions.length - 1 ? "Finish & Evaluate →" : "Next Question →"}
              </button>
            </div>
          )}
        </div>
      </main>
      <style>{`.glass-card{background:rgba(71,98,150,.35);backdrop-filter:blur(24px);border-top:1px solid rgba(147,172,216,.15);border-left:1px solid rgba(147,172,216,.15)}`}</style>
    </div>
  );
}