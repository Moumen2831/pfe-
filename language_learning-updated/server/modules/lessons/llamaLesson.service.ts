import { invokeLLM } from "../../_core/llm";
import { buildLessonPrompt } from "./lesson.prompts";
import type { DynamicLesson, GenerateLessonInput } from "./lesson.types";

function extractJson(content: unknown) {
  if (typeof content !== "string") return content;
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

function resolveLlamaConfig() {
  if (process.env.LLAMA_API_URL) {
    return {
      provider: "custom-llama",
      url: process.env.LLAMA_API_URL,
      apiKey: process.env.LLAMA_API_KEY,
      model: process.env.LLAMA_MODEL ?? "llama-3",
      body: (prompt: string) => ({
        model: process.env.LLAMA_MODEL ?? "llama-3",
        prompt,
        temperature: 0.75,
        max_tokens: 8000,
        response_format: "json",
      }),
      extract: (data: any) => data.output ?? data.response ?? data.content ?? data,
    };
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY ?? process.env.VITE_OPENROUTER_API_KEY;
  if (openRouterKey) {
    return {
      provider: "openrouter-llama",
      url: process.env.OPENROUTER_API_URL ?? "https://openrouter.ai/api/v1/chat/completions",
      apiKey: openRouterKey,
      model: process.env.LLAMA_MODEL ?? "meta-llama/llama-3.1-70b-instruct",
      body: (prompt: string) => ({
        model: process.env.LLAMA_MODEL ?? "meta-llama/llama-3.1-70b-instruct",
        messages: [
          {
            role: "system",
            content: "You are a CEFR curriculum specialist. Generate substantial, accurate English lessons as valid JSON only. Do not wrap JSON in markdown.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.65,
        max_tokens: 8000,
        response_format: { type: "json_object" },
      }),
      extract: (data: any) => data.choices?.[0]?.message?.content ?? data,
    };
  }

  return null;
}

const topicVocabulary: Record<string, Array<{ word: string; definition: string; example: string }>> = {
  restaurant: [
    { word: "menu", definition: "A list of food and drinks.", example: "Could I see the menu, please?" },
    { word: "starter", definition: "A small dish before the main meal.", example: "I would like soup as a starter." },
    { word: "bill", definition: "The amount of money to pay.", example: "Could we have the bill, please?" },
    { word: "reservation", definition: "An arrangement to keep a table.", example: "I have a reservation for two people." },
    { word: "recommend", definition: "To suggest a good choice.", example: "What dish do you recommend?" },
  ],
  travel: [
    { word: "ticket", definition: "A document that lets you travel.", example: "I bought a train ticket online." },
    { word: "platform", definition: "The place where passengers get on a train.", example: "The train leaves from platform four." },
    { word: "luggage", definition: "Bags used for travel.", example: "My luggage is very heavy." },
    { word: "delay", definition: "A situation where something is late.", example: "There is a short delay today." },
    { word: "destination", definition: "The place you are going to.", example: "Paris is our destination." },
  ],
  shopping: [
    { word: "receipt", definition: "A paper or message showing payment.", example: "Please keep your receipt." },
    { word: "discount", definition: "A lower price than usual.", example: "This jacket has a twenty percent discount." },
    { word: "size", definition: "How big or small something is.", example: "Do you have this in a larger size?" },
    { word: "cashier", definition: "A person who takes payment in a shop.", example: "The cashier was very helpful." },
    { word: "exchange", definition: "To return something and get another item.", example: "Can I exchange this shirt?" },
  ],
  work: [
    { word: "meeting", definition: "A planned discussion with other people.", example: "We have a meeting at ten." },
    { word: "deadline", definition: "The latest time to finish work.", example: "The deadline is Friday." },
    { word: "task", definition: "A piece of work to do.", example: "This task is important." },
    { word: "schedule", definition: "A plan of times and activities.", example: "My schedule is full today." },
    { word: "colleague", definition: "A person you work with.", example: "My colleague helped me prepare." },
  ],
  health: [
    { word: "appointment", definition: "A planned meeting with a doctor.", example: "I have a doctor appointment tomorrow." },
    { word: "symptom", definition: "A sign of illness.", example: "A cough can be a symptom." },
    { word: "medicine", definition: "Something you take to feel better.", example: "Take this medicine after lunch." },
    { word: "pain", definition: "An uncomfortable feeling in the body.", example: "I have pain in my shoulder." },
    { word: "recover", definition: "To become healthy again.", example: "I need time to recover." },
  ],
};

const genericVocabulary = [
  { word: "request", definition: "Something you ask for politely.", example: "I have a request about the lesson." },
  { word: "practice", definition: "Repeated work to improve a skill.", example: "Speaking practice helps fluency." },
  { word: "response", definition: "An answer to a question or situation.", example: "Give a clear response." },
  { word: "explain", definition: "To make something clear.", example: "Can you explain the answer?" },
  { word: "improve", definition: "To become better.", example: "I want to improve my English." },
];

const cefrQuality = {
  A1: { vocabularyCount: 6, grammarExamples: 3, practiceCount: 3, dialogueLines: 6, quizCount: 5 },
  A2: { vocabularyCount: 7, grammarExamples: 3, practiceCount: 3, dialogueLines: 8, quizCount: 6 },
  B1: { vocabularyCount: 8, grammarExamples: 4, practiceCount: 4, dialogueLines: 10, quizCount: 7 },
  B2: { vocabularyCount: 10, grammarExamples: 5, practiceCount: 4, dialogueLines: 12, quizCount: 8 },
  C1: { vocabularyCount: 12, grammarExamples: 6, practiceCount: 5, dialogueLines: 14, quizCount: 10 },
  C2: { vocabularyCount: 14, grammarExamples: 7, practiceCount: 6, dialogueLines: 16, quizCount: 12 },
} as const;

const grammarPatterns: Record<string, Array<{ title: string; explanation: string; examples: string[]; practicePrompt: string; expectedAnswer: string }>> = {
  A1: [
    {
      title: "Simple Present with I",
      explanation: "Use the simple present to talk about regular actions and facts.",
      examples: ["I need help.", "I like this place."],
      practicePrompt: "Complete: I ___ English every day.",
      expectedAnswer: "I study English every day.",
    },
  ],
  A2: [
    {
      title: "Polite Requests with Could",
      explanation: "Use 'Could I...' or 'Could you...' to ask politely.",
      examples: ["Could I have a table, please?", "Could you repeat that, please?"],
      practicePrompt: "Make this polite: I want help.",
      expectedAnswer: "Could I have help, please?",
    },
    {
      title: "Would Like",
      explanation: "Use 'would like' to say what you want in a polite way.",
      examples: ["I would like some water.", "She would like a quiet table."],
      practicePrompt: "Rewrite politely: I want coffee.",
      expectedAnswer: "I would like coffee, please.",
    },
  ],
  B1: [
    {
      title: "Giving Reasons with Because",
      explanation: "Use 'because' to connect an action with its reason.",
      examples: ["I chose this option because it is faster.", "I called because I had a question."],
      practicePrompt: "Join: I am late. The bus was delayed.",
      expectedAnswer: "I am late because the bus was delayed.",
    },
  ],
  B2: [
    {
      title: "Comparing Options",
      explanation: "Use comparative phrases to discuss advantages and disadvantages.",
      examples: ["This option is more convenient.", "The second choice is less expensive."],
      practicePrompt: "Compare two choices using 'more convenient'.",
      expectedAnswer: "The online option is more convenient than going in person.",
    },
  ],
  C1: [
    {
      title: "Hedging, Stance, and Nominalisation",
      explanation: "At C1, advanced speakers soften claims, signal stance, and compress ideas using nominalisation. This helps them sound precise without sounding too direct.",
      examples: [
        "There appears to be a mismatch between the stated goal and the actual outcome.",
        "A more cautious interpretation would be that the evidence is incomplete.",
        "The proposal's main limitation lies in its lack of long-term planning.",
        "It is worth considering whether the current approach is sustainable.",
        "What makes this option persuasive is not its speed, but its reliability.",
        "The decision should be framed as a strategic adjustment rather than a failure.",
      ],
      practicePrompt: "Rewrite this at C1 level with hedging and nominalisation: The plan is bad because it is risky.",
      expectedAnswer: "A more cautious assessment would be that the plan's main weakness lies in its level of risk.",
    },
  ],
  C2: [
    {
      title: "Emphasis and Precision",
      explanation: "Use precise phrasing to express subtle meaning and emphasis.",
      examples: ["What matters most is consistency.", "The issue is not cost, but reliability."],
      practicePrompt: "Write a precise sentence contrasting cost and quality.",
      expectedAnswer: "The concern is not only cost, but also long-term quality.",
    },
  ],
};

const scenarioOpeners = [
  "You are practicing in a real-life situation.",
  "You need to solve a small communication problem.",
  "You are preparing for a short conversation.",
  "You want to ask for information clearly.",
];

function pick<T>(items: T[], seed: number) {
  return items[Math.abs(seed) % items.length];
}

function shuffleWithSeed<T>(items: T[], seed: number) {
  return [...items].sort((a, b) => {
    const left = JSON.stringify(a).length + seed;
    const right = JSON.stringify(b).length + seed * 3;
    return (left % 7) - (right % 7);
  });
}

function normalizeTopic(topic: string) {
  return topic.trim().toLowerCase().replace(/\s+/g, " ");
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, char => char.toUpperCase());
}

function getTopicVocabulary(topic: string, seed: number) {
  const normalized = normalizeTopic(topic);
  const matchingKey = Object.keys(topicVocabulary).find(key => normalized.includes(key));
  const source = matchingKey ? topicVocabulary[matchingKey] : genericVocabulary.map(item => ({
    ...item,
    example: item.example.replace("lesson", topic),
  }));

  return shuffleWithSeed(source, seed);
}

function buildExtraVocabulary(topic: string, cefrLevel: GenerateLessonInput["cefrLevel"], count: number, seed: number) {
  const advanced = cefrLevel === "C1" || cefrLevel === "C2";
  const upper = cefrLevel === "B2" || advanced;
  const templates = advanced
    ? [
        ["subtle distinction", `A small but important difference in how people understand ${topic}.`, `The speaker made a subtle distinction between convenience and credibility.`],
        ["underlying assumption", `An unstated belief that shapes an argument about ${topic}.`, `The underlying assumption is that everyone has equal access to the service.`],
        ["pragmatic compromise", `A practical solution that balances competing needs.`, `A pragmatic compromise may be more realistic than an ideal solution.`],
        ["register", `The level of formality used in communication.`, `The register should be more diplomatic in a professional discussion.`],
        ["reframe", `To present an idea in a different and often more useful way.`, `Try to reframe the complaint as a request for clarification.`],
        ["implication", `A possible result or meaning that is not directly stated.`, `The implication is that the policy may affect smaller teams.`],
        ["credible", `Believable and reliable.`, `A credible explanation needs evidence and careful wording.`],
        ["concession", `An admission that another point has some value.`, `A useful concession can make your argument sound balanced.`],
      ]
    : upper
      ? [
          ["alternative", `Another possible choice related to ${topic}.`, `We should compare this alternative with the original plan.`],
          ["advantage", `A positive point or benefit.`, `The main advantage is that it saves time.`],
          ["concern", `A worry or possible problem.`, `One concern is the cost.`],
          ["solution", `A way to deal with a problem.`, `This solution is simple but effective.`],
        ]
      : [
          ["choice", `Something you can choose.`, `This choice is good for me.`],
          ["question", `Something you ask.`, `I have a question about ${topic}.`],
          ["answer", `A reply to a question.`, `The answer is clear.`],
          ["help", `Support from another person.`, `I need help with ${topic}.`],
        ];

  const base = templates.map(([word, definition, example]) => ({ word, definition, example }));
  const repeated = Array.from({ length: Math.ceil(count / base.length) }, (_, index) =>
    base.map(item => ({ ...item, word: index === 0 ? item.word : `${item.word} ${index + 1}` }))
  ).flat();

  return shuffleWithSeed(repeated, seed).slice(0, count);
}

function buildGrammarExamples(grammar: { examples: string[] }, topic: string, cefrLevel: GenerateLessonInput["cefrLevel"], count: number) {
  const advancedExamples = [
    `What complicates the discussion of ${topic} is the gap between intention and implementation.`,
    `It would be premature to conclude that the proposed approach is ineffective.`,
    `The more persuasive argument is not that ${topic} is simple, but that it can be managed carefully.`,
    `Had the speaker clarified the context earlier, the misunderstanding might have been avoided.`,
    `The issue should be evaluated in terms of feasibility, fairness, and long-term impact.`,
  ];
  const simpleExamples = [
    `I can talk about ${topic}.`,
    `Could you help me with ${topic}, please?`,
    `This is useful for ${topic}.`,
  ];

  const source = cefrLevel === "C1" || cefrLevel === "C2"
    ? [...grammar.examples, ...advancedExamples]
    : [...grammar.examples, ...simpleExamples];

  return source.slice(0, count);
}

function buildPractice(grammar: { practicePrompt: string; expectedAnswer: string }, topic: string, cefrLevel: GenerateLessonInput["cefrLevel"], count: number) {
  const tasks = [
    { prompt: grammar.practicePrompt, expectedAnswer: grammar.expectedAnswer },
    {
      prompt: `Create one sentence about ${topic} using the target grammar.`,
      expectedAnswer: cefrLevel === "C1" || cefrLevel === "C2"
        ? `A more nuanced view of ${topic} would take both immediate constraints and long-term implications into account.`
        : `I can use this grammar to talk about ${topic}.`,
    },
    {
      prompt: `Rewrite this to sound more appropriate for ${cefrLevel}: I think this is good.`,
      expectedAnswer: cefrLevel === "C1" || cefrLevel === "C2"
        ? "There are strong grounds for considering this a credible and well-balanced option."
        : "I think this is a good option because it is useful.",
    },
    {
      prompt: `Identify the tone needed when discussing ${topic} in a formal situation.`,
      expectedAnswer: cefrLevel === "C1" || cefrLevel === "C2"
        ? "The tone should be diplomatic, precise, and balanced, with claims softened where evidence is incomplete."
        : "The tone should be polite and clear.",
    },
    {
      prompt: `Add a reason and a contrast to a sentence about ${topic}.`,
      expectedAnswer: `Although ${topic} can be challenging, it becomes easier when the speaker gives a clear reason.`,
    },
    {
      prompt: `Reformulate a direct complaint about ${topic} into a constructive request.`,
      expectedAnswer: `Could we clarify the main issue so that we can find a practical solution?`,
    },
  ];

  return tasks.slice(0, count);
}

function buildDialogueLines(topic: string, cefrLevel: GenerateLessonInput["cefrLevel"], count: number, requestSentence: string, answerSentence: string) {
  const advanced = cefrLevel === "C1" || cefrLevel === "C2";
  const lines = advanced
    ? [
        { speaker: "Learner", text: requestSentence },
        { speaker: "Partner", text: answerSentence },
        { speaker: "Learner", text: `I see your point, but I wonder whether the same argument applies when ${topic} involves different expectations.` },
        { speaker: "Partner", text: "That is a fair qualification. The context changes the register and the level of detail required." },
        { speaker: "Learner", text: "So the issue is not only what I say, but how directly I say it." },
        { speaker: "Partner", text: "Exactly. A more diplomatic formulation can sound both confident and respectful." },
        { speaker: "Learner", text: `Would it be accurate to frame ${topic} as a matter of balancing clarity with tact?` },
        { speaker: "Partner", text: "Yes, and that framing shows a strong command of nuance." },
        { speaker: "Learner", text: "Let me rephrase my point more carefully before I respond." },
        { speaker: "Partner", text: "Good. Try to include a concession, then state your main position." },
        { speaker: "Learner", text: "Although there are practical constraints, the broader implication deserves closer attention." },
        { speaker: "Partner", text: "That sounds much more precise and appropriate for an advanced discussion." },
        { speaker: "Learner", text: "I will also avoid overstating the claim unless I can support it." },
        { speaker: "Partner", text: "That is the kind of control expected at this level." },
        { speaker: "Learner", text: "Thanks. I can now express disagreement without sounding dismissive." },
        { speaker: "Partner", text: "Exactly. That is a valuable communication skill." },
      ]
    : [
        { speaker: "Learner", text: requestSentence },
        { speaker: "Partner", text: answerSentence },
        { speaker: "Learner", text: `Can you give me one example about ${topic}?` },
        { speaker: "Partner", text: `Yes. You can use this phrase when you talk about ${topic}.` },
        { speaker: "Learner", text: "Thank you. That is clear." },
        { speaker: "Partner", text: "You're welcome. Try to say it again." },
        { speaker: "Learner", text: requestSentence },
        { speaker: "Partner", text: "Good. That sounds polite and clear." },
      ];

  return lines.slice(0, count);
}

function buildListeningText(topic: string, cefrLevel: GenerateLessonInput["cefrLevel"], requestSentence: string, answerSentence: string) {
  if (cefrLevel === "C1" || cefrLevel === "C2") {
    return `In a professional discussion about ${topic}, the speaker begins by acknowledging that the issue is more complex than it first appears. ${requestSentence} The response is careful: ${answerSentence} The second speaker explains that advanced communication depends on choosing the right register, softening claims when evidence is incomplete, and making distinctions between personal preference, practical constraints, and long-term implications. The first speaker then reformulates a direct opinion into a more balanced statement, adding a concession before presenting the main point. This shift changes the tone of the exchange. Instead of sounding defensive, the speaker sounds reflective and credible. The discussion ends with both speakers agreeing that accuracy is not only a matter of correct grammar; it also involves nuance, audience awareness, and the ability to adapt language to a specific communicative purpose.`;
  }

  return `You are practicing in a real-life situation about ${topic}. ${requestSentence} ${answerSentence} The speakers use clear and polite language. They ask for help, give an answer, and repeat the useful phrase. This helps the learner understand how to use English in a practical conversation.`;
}

function buildQuiz(topic: string, cefrLevel: GenerateLessonInput["cefrLevel"], vocabulary: Array<{ word: string; definition: string }>, count: number) {
  const advanced = cefrLevel === "C1" || cefrLevel === "C2";
  const questions = [
    {
      id: "quiz-q-1",
      type: "multiple_choice",
      question: `Which word is most relevant to a nuanced discussion of ${topic}?`,
      options: [vocabulary[0].word, "triangle", "battery", "ceiling"],
      correctAnswer: vocabulary[0].word,
      explanation: `${vocabulary[0].word} is part of the lesson vocabulary.`,
    },
    {
      id: "quiz-q-2",
      type: "multiple_choice",
      question: advanced ? "Which sentence uses hedging appropriately?" : "Which sentence is polite?",
      options: advanced
        ? ["This is definitely wrong.", "It may be worth considering another interpretation.", "You must agree.", "There is no discussion."]
        : ["Help me now.", "Could you help me, please?", "I want now.", "Do it."],
      correctAnswer: advanced ? "It may be worth considering another interpretation." : "Could you help me, please?",
      explanation: advanced ? "The sentence softens the claim and leaves room for nuance." : "The sentence uses could and please.",
    },
    {
      id: "quiz-q-3",
      type: "multiple_choice",
      question: advanced ? "What is the purpose of a concession?" : `What is the topic of the lesson?`,
      options: advanced
        ? ["To ignore the other side", "To show that another point has some value", "To end the conversation", "To avoid grammar"]
        : [topic, "weather", "sports", "music"],
      correctAnswer: advanced ? "To show that another point has some value" : topic,
      explanation: advanced ? "A concession makes an argument sound balanced." : `The lesson focuses on ${topic}.`,
    },
    {
      id: "quiz-q-4",
      type: "multiple_choice",
      question: advanced ? "Which feature is expected at C1?" : "Why do we practice dialogue?",
      options: advanced
        ? ["Only short answers", "Nuance and register control", "No examples", "Single-word responses"]
        : ["To practice real conversation", "To draw pictures", "To count numbers only", "To avoid speaking"],
      correctAnswer: advanced ? "Nuance and register control" : "To practice real conversation",
      explanation: advanced ? "C1 speakers manage tone, precision, and audience expectations." : "Dialogue helps learners use language in context.",
    },
  ];

  while (questions.length < count) {
    const index = questions.length;
    const vocab = vocabulary[index % vocabulary.length];
    questions.push({
      id: `quiz-q-${index + 1}`,
      type: "multiple_choice",
      question: `What does "${vocab.word}" mean in this lesson?`,
      options: [vocab.definition, "A place to sleep", "A type of food only", "A number"],
      correctAnswer: vocab.definition,
      explanation: `"${vocab.word}" means: ${vocab.definition}`,
    });
  }

  return questions.slice(0, count);
}

export function createPrototypeLesson(input: GenerateLessonInput): DynamicLesson {
  const seed = Date.now() + Math.floor(Math.random() * 10000);
  const topic = normalizeTopic(input.topic);
  const topicTitle = titleCase(topic);
  const quality = cefrQuality[input.cefrLevel];
  const baseVocabulary = getTopicVocabulary(topic, seed);
  const vocabulary = shuffleWithSeed([
    ...baseVocabulary,
    ...buildExtraVocabulary(topic, input.cefrLevel, quality.vocabularyCount, seed),
  ], seed).slice(0, quality.vocabularyCount);
  const grammar = pick(grammarPatterns[input.cefrLevel], seed);
  const opener = pick(scenarioOpeners, seed);
  const requestSentence = input.cefrLevel === "A1"
    ? `I need help with ${topic}.`
    : input.cefrLevel === "A2"
      ? `Could you help me with ${topic}, please?`
      : input.cefrLevel === "B1" || input.cefrLevel === "B2"
        ? `Could you explain the best option for ${topic} and give me a reason?`
        : `Could you help me formulate a nuanced position on ${topic}, taking register and audience expectations into account?`;
  const answerSentence = input.cefrLevel === "A1"
    ? `Yes, I can help you with ${topic}.`
    : input.cefrLevel === "A2"
      ? `Of course. Let me show you the main options.`
      : input.cefrLevel === "B1" || input.cefrLevel === "B2"
        ? `Certainly. The best choice depends on your goal, your time, and the situation.`
        : `Certainly. The most effective response would balance precision, diplomacy, and the assumptions your audience is likely to bring.`;

  return {
    title: `${topicTitle}: ${pick(["Practical English", "Everyday Communication", "Guided Practice", "Real-Life English"], seed)}`,
    description: `A ${input.cefrLevel} ${input.skillFocus} lesson about ${topic}, generated for testing with varied vocabulary, grammar, dialogue, listening, speaking, and quiz tasks.`,
    leadIn: input.cefrLevel === "C1" || input.cefrLevel === "C2"
      ? `Do you know how to discuss ${topic} with precision, nuance and the right level of formality? Test what you know, then read the explanation to refine your language.`
      : `Do you know how to use English to talk about ${topic}? Try the first test, then read the explanation and practise again.`,
    exampleSentences: buildGrammarExamples(grammar, topic, input.cefrLevel, Math.min(6, quality.grammarExamples)),
    cefrLevel: input.cefrLevel,
    topic,
    skillFocus: input.skillFocus,
    estimatedDurationMinutes: input.estimatedDurationMinutes,
    learningObjectives: [
      `Use key vocabulary related to ${topic}.`,
      `Apply ${grammar.title.toLowerCase()} in context.`,
      `Respond clearly in a ${topic} conversation.`,
      input.cefrLevel === "C1" || input.cefrLevel === "C2"
        ? `Control nuance, register, and stance in advanced discussion of ${topic}.`
        : `Answer comprehension and speaking tasks about ${topic}.`,
    ],
    blocks: [
      {
        id: `diagnostic-quiz-${seed}`,
        type: "quiz",
        title: "Grammar test 1",
        questions: buildQuiz(topic, input.cefrLevel, vocabulary, Math.max(4, Math.floor(quality.quizCount / 2))),
      },
      {
        id: `vocabulary-${seed}`,
        type: "vocabulary",
        title: `${topicTitle} Vocabulary`,
        items: vocabulary.map(item => ({ ...item, translation: null })),
      },
      {
        id: `grammar-${seed}`,
        type: "grammar",
        title: "Grammar explanation",
        explanation: grammar.explanation,
        examples: buildGrammarExamples(grammar, topic, input.cefrLevel, quality.grammarExamples),
        sections: [
          {
            heading: grammar.title,
            explanation: grammar.explanation,
            examples: buildGrammarExamples(grammar, topic, input.cefrLevel, Math.min(4, quality.grammarExamples)),
          },
          {
            heading: input.cefrLevel === "C1" || input.cefrLevel === "C2" ? "Formality and stance" : "How to use it",
            explanation: input.cefrLevel === "C1" || input.cefrLevel === "C2"
              ? `At ${input.cefrLevel}, the same idea can sound too direct, balanced, or diplomatic depending on register. Use hedging, concessions and precise nouns to control your stance.`
              : `Use the target language when you need to ask, answer or explain something about ${topic}. Keep the sentence clear and polite.`,
            examples: input.cefrLevel === "C1" || input.cefrLevel === "C2"
              ? [
                  `A direct claim: This approach is wrong.`,
                  `A more balanced claim: This approach may be difficult to justify without stronger evidence.`,
                  `A diplomatic reformulation: It might be worth reconsidering the assumptions behind this approach.`,
                ]
              : [
                  `Can you help me with ${topic}?`,
                  `I would like more information about ${topic}.`,
                  `This is useful because it is clear.`,
                ],
            table: {
              headers: input.cefrLevel === "C1" || input.cefrLevel === "C2"
                ? ["Function", "Useful language", "Effect"]
                : ["Situation", "Useful language", "Example"],
              rows: input.cefrLevel === "C1" || input.cefrLevel === "C2"
                ? [
                    ["Hedge a claim", "It appears that ...", "Makes a statement less absolute"],
                    ["Add a concession", "Although this is valid, ...", "Shows balance"],
                    ["Reformulate", "A more precise way to put this is ...", "Improves clarity"],
                  ]
                : [
                    ["Ask politely", "Could you ...?", `Could you explain ${topic}?`],
                    ["Say what you want", "I would like ...", `I would like help with ${topic}.`],
                    ["Give a reason", "because ...", `This is useful because it is clear.`],
                  ],
            },
          },
        ],
        commonMistakes: input.cefrLevel === "C1" || input.cefrLevel === "C2"
          ? [
              {
                incorrect: "This is completely wrong.",
                correct: "This interpretation may be difficult to support.",
                note: "Advanced speakers often soften claims when evidence is incomplete.",
              },
              {
                incorrect: "I don't agree with you.",
                correct: "I see the point, although I would frame the issue differently.",
                note: "A concession makes disagreement sound more diplomatic.",
              },
            ]
          : [
              {
                incorrect: "Help me now.",
                correct: "Could you help me, please?",
                note: "Use could and please to sound polite.",
              },
              {
                incorrect: "I want information.",
                correct: "I would like some information, please.",
                note: "Would like is softer than want.",
              },
            ],
        practice: buildPractice(grammar, topic, input.cefrLevel, quality.practiceCount),
      },
      {
        id: `practice-quiz-${seed}`,
        type: "quiz",
        title: "Grammar test 2",
        questions: buildQuiz(topic, input.cefrLevel, vocabulary, quality.quizCount),
      },
      {
        id: `dialogue-${seed}`,
        type: "dialogue",
        title: `${topicTitle} Dialogue`,
        speakers: [
          { name: "Learner", role: "English learner" },
          { name: "Partner", role: "conversation partner" },
        ],
        lines: buildDialogueLines(topic, input.cefrLevel, quality.dialogueLines, requestSentence, answerSentence),
      },
      {
        id: `listening-${seed}`,
        type: "listening",
        title: "Listening Check",
        audioText: `${opener} ${buildListeningText(topic, input.cefrLevel, requestSentence, answerSentence)}`,
        questions: [
          {
            id: `listen-q-${seed}`,
            type: "multiple_choice",
            question: `What is the conversation mainly about?`,
            options: [topicTitle, "A sports result", "A weather report", "A movie review"],
            correctAnswer: topicTitle,
            explanation: `The speakers are practicing language for ${topic}.`,
          },
          {
            id: `listen-inference-${seed}`,
            type: "multiple_choice",
            question: input.cefrLevel === "C1" || input.cefrLevel === "C2"
              ? "What does the speaker imply about advanced communication?"
              : "Why is the conversation useful?",
            options: input.cefrLevel === "C1" || input.cefrLevel === "C2"
              ? ["It requires audience awareness and nuance", "It only requires memorised words", "It avoids register", "It should always be informal"]
              : ["It shows useful language in context", "It teaches spelling only", "It is about numbers", "It has no examples"],
            correctAnswer: input.cefrLevel === "C1" || input.cefrLevel === "C2"
              ? "It requires audience awareness and nuance"
              : "It shows useful language in context",
            explanation: input.cefrLevel === "C1" || input.cefrLevel === "C2"
              ? "The listening text highlights register, nuance, and communicative purpose."
              : "The speakers model practical language.",
          },
        ],
      },
      {
        id: `speaking-${seed}`,
        type: "speaking",
        title: "Speaking Practice",
        instruction: input.cefrLevel === "C1" || input.cefrLevel === "C2"
          ? "Give a 60-90 second response. Include a concession, a clear stance, one example, and a final reformulation."
          : "Read the sentence aloud clearly, then make one similar sentence.",
        targetText: input.cefrLevel === "C1" || input.cefrLevel === "C2"
          ? `Discuss ${topic} from two perspectives. Start with a concession, explain your position carefully, and avoid overstating your claim.`
          : requestSentence,
        evaluationCriteria: { pronunciation: true, fluency: true, accuracy: true },
      },
      {
        id: `quiz-${seed}`,
        type: "quiz",
        title: "Review quiz",
        questions: buildQuiz(topic, input.cefrLevel, vocabulary, quality.quizCount),
      },
    ],
    metadata: {
      generatedBy: "llama-3-prototype-fallback",
      version: 1,
      language: "en",
      createdFor: "testing",
      vrReady: true,
      seed,
    },
    vrScene: {
      enabled: false,
      environment: topic.includes("restaurant") ? "restaurant" : topic.includes("travel") ? "station" : "classroom",
      interactions: [],
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function asStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return strings.length > 0 ? strings : fallback;
}

function normalizeQuestions(value: unknown, fallbackQuestion: string, fallbackAnswer: string) {
  if (!Array.isArray(value) || value.length === 0) {
    return [{
      id: "q-1",
      type: "multiple_choice",
      question: fallbackQuestion,
      options: [fallbackAnswer, "Not mentioned", "Different topic", "No answer"],
      correctAnswer: fallbackAnswer,
      explanation: "This answer matches the lesson content.",
    }];
  }

  return value.map((rawQuestion, index) => {
    const question = asRecord(rawQuestion);
    const options = Array.isArray(question.options)
      ? question.options.filter((option): option is string => typeof option === "string")
      : undefined;
    const correctAnswer = question.correctAnswer ?? question.answer ?? options?.[0] ?? fallbackAnswer;

    return {
      id: asString(question.id, `q-${index + 1}`),
      type: asString(question.type, options ? "multiple_choice" : "short_answer"),
      question: asString(question.question ?? question.prompt, fallbackQuestion),
      ...(options && options.length > 0 ? { options } : {}),
      correctAnswer,
      explanation: asString(question.explanation, "Review the lesson content to confirm the answer."),
    };
  });
}

function mergeToCount<T>(primary: T[], fallback: T[], count: number) {
  const merged = [...primary];
  for (const item of fallback) {
    if (merged.length >= count) break;
    merged.push(item);
  }
  return merged.slice(0, count);
}

function uniqueQuestionIds<T extends { id?: string }>(questions: unknown[], prefix: string) {
  const seen = new Map<string, number>();

  return questions.map((rawQuestion, index) => {
    const question = asRecord(rawQuestion) as T;
    const baseId = question.id && question.id.trim().length > 0
      ? question.id
      : `${prefix}-q-${index + 1}`;
    const count = seen.get(baseId) ?? 0;
    seen.set(baseId, count + 1);

    return {
      ...question,
      id: count === 0 ? baseId : `${baseId}-${count + 1}`,
    };
  });
}

function normalizeLessonBlock(rawBlock: unknown, index: number, fallback: DynamicLesson) {
  const block = asRecord(rawBlock);
  const content = asRecord(block.content);
  const merged = { ...content, ...block };
  const fallbackBlock = fallback.blocks[index] ?? fallback.blocks[0];
  const type = asString(merged.type, fallbackBlock.type);
  const id = asString(merged.id, `${type}-${Date.now()}-${index + 1}`);
  const title = asString(merged.title, fallbackBlock.title);

  if (type === "vocabulary") {
    const rawItems = merged.items ?? merged.words ?? merged.vocabulary ?? content.items;
    const items = Array.isArray(rawItems) && rawItems.length > 0
      ? rawItems.map((rawItem, itemIndex) => {
          const item = asRecord(rawItem);
          const word = asString(item.word ?? item.term ?? item.phrase, `word ${itemIndex + 1}`);
          return {
            word,
            definition: asString(item.definition ?? item.meaning ?? item.explanation, `A useful expression for this lesson: ${word}.`),
            example: asString(item.example ?? item.sentence, `Use ${word} in a clear sentence.`),
            translation: typeof item.translation === "string" ? item.translation : null,
          };
        })
      : (fallbackBlock.type === "vocabulary" ? fallbackBlock.items : fallback.blocks[0] as any).items;

    return { id, type: "vocabulary", title, items };
  }

  if (type === "grammar") {
    const fallbackGrammar = fallback.blocks.find(block => block.type === "grammar") as any;
    return {
      id,
      type: "grammar",
      title,
      explanation: asString(merged.explanation ?? merged.rule ?? merged.description, fallbackGrammar.explanation),
      examples: asStringArray(merged.examples, fallbackGrammar.examples),
      practice: Array.isArray(merged.practice) && merged.practice.length > 0
        ? merged.practice.map((rawPractice, practiceIndex) => {
            const practice = asRecord(rawPractice);
            return {
              prompt: asString(practice.prompt ?? practice.question, `Practice item ${practiceIndex + 1}`),
              expectedAnswer: asString(practice.expectedAnswer ?? practice.answer, "A clear answer using the grammar pattern."),
            };
          })
        : fallbackGrammar.practice,
    };
  }

  if (type === "dialogue") {
    const fallbackDialogue = fallback.blocks.find(block => block.type === "dialogue") as any;
    const rawLines = merged.lines ?? merged.dialogue ?? merged.conversation;
    const lines = Array.isArray(rawLines) && rawLines.length > 0
      ? rawLines.map((rawLine, lineIndex) => {
          if (typeof rawLine === "string") {
            return { speaker: lineIndex % 2 === 0 ? "Learner" : "Partner", text: rawLine };
          }
          const line = asRecord(rawLine);
          return {
            speaker: asString(line.speaker ?? line.name, lineIndex % 2 === 0 ? "Learner" : "Partner"),
            text: asString(line.text ?? line.line ?? line.content, "Let's practice this conversation."),
          };
        })
      : fallbackDialogue.lines;

    return {
      id,
      type: "dialogue",
      title,
      speakers: Array.isArray(merged.speakers) ? merged.speakers : fallbackDialogue.speakers,
      lines,
    };
  }

  if (type === "listening") {
    const fallbackListening = fallback.blocks.find(block => block.type === "listening") as any;
    const audioText = asString(merged.audioText ?? merged.transcript ?? merged.text ?? merged.script, fallbackListening.audioText);
    return {
      id,
      type: "listening",
      title,
      audioText,
      questions: normalizeQuestions(merged.questions, "What is the listening mainly about?", fallback.topic),
    };
  }

  if (type === "speaking") {
    const fallbackSpeaking = fallback.blocks.find(block => block.type === "speaking") as any;
    return {
      id,
      type: "speaking",
      title,
      instruction: asString(merged.instruction ?? merged.prompt, fallbackSpeaking.instruction),
      targetText: asString(merged.targetText ?? merged.sentence ?? merged.text, fallbackSpeaking.targetText),
      evaluationCriteria: {
        pronunciation: true,
        fluency: true,
        accuracy: true,
        ...asRecord(merged.evaluationCriteria),
      },
    };
  }

  const fallbackQuiz = fallback.blocks.find(block => block.type === "quiz") as any;
  return {
    id,
    type: "quiz",
    title,
    questions: normalizeQuestions(merged.questions, "Choose the best answer.", String(fallbackQuiz.questions[0].correctAnswer)),
  };
}

export function normalizeGeneratedLesson(rawLesson: unknown, input: GenerateLessonInput): DynamicLesson {
  const fallback = createPrototypeLesson(input);
  const quality = cefrQuality[input.cefrLevel];
  const lesson = asRecord(rawLesson);
  const rawBlocks = Array.isArray(lesson.blocks) ? lesson.blocks : fallback.blocks;
  const normalizedBlocks: DynamicLesson["blocks"] = rawBlocks.map((block, index) =>
    normalizeLessonBlock(block, index, fallback)
  ) as DynamicLesson["blocks"];
  const existingTypes = new Set(normalizedBlocks.map(block => block.type));

  for (const fallbackBlock of fallback.blocks) {
    if (!existingTypes.has(fallbackBlock.type)) {
      normalizedBlocks.push(fallbackBlock);
    }
  }

  const qualityBlocks = normalizedBlocks.map(block => {
    const fallbackBlock = fallback.blocks.find(item => item.type === block.type) as any;

    if (block.type === "vocabulary") {
      const typedBlock = block as any;
      return {
        ...typedBlock,
        items: mergeToCount(typedBlock.items, fallbackBlock.items, quality.vocabularyCount),
      };
    }

    if (block.type === "grammar") {
      const typedBlock = block as any;
      return {
        ...typedBlock,
        examples: mergeToCount(typedBlock.examples, fallbackBlock.examples, quality.grammarExamples),
        practice: mergeToCount(typedBlock.practice, fallbackBlock.practice, quality.practiceCount),
      };
    }

    if (block.type === "dialogue") {
      const typedBlock = block as any;
      return {
        ...typedBlock,
        lines: mergeToCount(typedBlock.lines, fallbackBlock.lines, quality.dialogueLines),
      };
    }

    if (block.type === "listening") {
      const typedBlock = block as any;
      return {
        ...typedBlock,
        audioText: typedBlock.audioText.split(/\s+/).length < 80 ? fallbackBlock.audioText : typedBlock.audioText,
        questions: uniqueQuestionIds(
          mergeToCount(typedBlock.questions, fallbackBlock.questions, Math.min(4, quality.quizCount)),
          typedBlock.id
        ),
      };
    }

    if (block.type === "quiz") {
      const typedBlock = block as any;
      return {
        ...typedBlock,
        questions: uniqueQuestionIds(
          mergeToCount(typedBlock.questions, fallbackBlock.questions, quality.quizCount),
          typedBlock.id
        ),
      };
    }

    return block;
  });

  return {
    title: asString(lesson.title, fallback.title),
    description: asString(lesson.description, fallback.description),
    leadIn: asString(lesson.leadIn, fallback.leadIn ?? ""),
    exampleSentences: asStringArray(lesson.exampleSentences, fallback.exampleSentences ?? []),
    cefrLevel: input.cefrLevel,
    topic: input.topic,
    skillFocus: input.skillFocus,
    estimatedDurationMinutes: input.estimatedDurationMinutes,
    learningObjectives: asStringArray(lesson.learningObjectives ?? lesson.objectives, fallback.learningObjectives),
    blocks: qualityBlocks as DynamicLesson["blocks"],
    metadata: {
      generatedBy: asString(asRecord(lesson.metadata).generatedBy, "llama-3"),
      version: typeof asRecord(lesson.metadata).version === "number" ? asRecord(lesson.metadata).version as number : 1,
      language: "en",
      createdFor: asString(asRecord(lesson.metadata).createdFor, "testing"),
      vrReady: true,
      seed: Date.now(),
    },
    vrScene: asRecord(lesson.vrScene).enabled === true
      ? lesson.vrScene as DynamicLesson["vrScene"]
      : fallback.vrScene,
  };
}

export async function generateLessonWithLlama(input: GenerateLessonInput) {
  const prompt = buildLessonPrompt(input);
  const llamaConfig = resolveLlamaConfig();

  if (!llamaConfig && !process.env.BUILT_IN_FORGE_API_KEY) {
    return { lesson: createPrototypeLesson(input), prompt };
  }

  try {
    if (llamaConfig) {
      const response = await fetch(llamaConfig.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(llamaConfig.apiKey ? { authorization: `Bearer ${llamaConfig.apiKey}` } : {}),
          "http-referer": process.env.APP_PUBLIC_URL ?? "http://localhost:3000",
          "x-title": "Language Learning Lesson Generator",
        },
        body: JSON.stringify(llamaConfig.body(prompt)),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => response.statusText);
        throw new Error(`${llamaConfig.provider} failed with ${response.status}: ${message}`);
      }
      const data = await response.json();
      return { lesson: normalizeGeneratedLesson(extractJson(llamaConfig.extract(data)), input), prompt };
    }

    const result = await invokeLLM({
      messages: [
        { role: "system", content: "Return valid JSON only." },
        { role: "user", content: prompt },
      ],
      responseFormat: { type: "json_object" },
    });

    return { lesson: normalizeGeneratedLesson(extractJson(result.choices[0]?.message.content), input), prompt };
  } catch (error) {
    console.warn("[Lessons] Llama generation failed, using prototype fallback:", error);
    return { lesson: createPrototypeLesson(input), prompt };
  }
}
