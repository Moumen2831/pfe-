import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const connection = await mysql.createConnection(process.env.DATABASE_URL);

// Sample lessons data
const lessons = [
  {
    title: "Basic Greetings",
    description: "Learn essential greetings and introductions",
    category: "Vocabulary",
    difficulty: "Beginner",
    content: "# Basic Greetings\n\nGreetings are the foundation of any language. Here are the most common greetings:\n\n- **Hello** - A universal greeting\n- **Hi** - Informal greeting\n- **Good morning** - Used before noon\n- **Good afternoon** - Used in the afternoon\n- **Good evening** - Used in the evening\n\nWhen greeting someone, it's polite to ask how they are doing.",
    examples: JSON.stringify([
      { text: "Hello, how are you?", translation: "Hola, ¿cómo estás?" },
      { text: "Hi, I'm doing well", translation: "Hola, estoy bien" },
      { text: "Good morning", translation: "Buenos días" },
    ]),
    order: 1,
  },
  {
    title: "Present Tense Verbs",
    description: "Master the present tense in English",
    category: "Grammar",
    difficulty: "Beginner",
    content: "# Present Tense Verbs\n\nThe present tense is used to describe actions happening now or general truths.\n\n## Simple Present\n- I/you/we/they **speak**\n- He/she/it **speaks**\n\n## Present Continuous\n- I **am speaking**\n- You/we/they **are speaking**\n- He/she/it **is speaking**",
    examples: JSON.stringify([
      { text: "I speak English", translation: "Hablo inglés" },
      { text: "She is speaking now", translation: "Ella está hablando ahora" },
      { text: "They speak French", translation: "Hablan francés" },
    ]),
    order: 2,
  },
  {
    title: "Common Phrases",
    description: "Useful phrases for daily conversations",
    category: "Vocabulary",
    difficulty: "Beginner",
    content: "# Common Phrases\n\nThese phrases are useful in everyday conversations:\n\n- **How are you?** - A polite question about someone's well-being\n- **What's your name?** - Asking for someone's name\n- **Nice to meet you** - A polite greeting\n- **Thank you** - Expressing gratitude\n- **You're welcome** - Responding to thanks",
    examples: JSON.stringify([
      { text: "What's your name?", translation: "¿Cuál es tu nombre?" },
      { text: "Nice to meet you", translation: "Mucho gusto" },
      { text: "Thank you very much", translation: "Muchas gracias" },
    ]),
    order: 3,
  },
  {
    title: "Past Tense",
    description: "Understanding past tense structures",
    category: "Grammar",
    difficulty: "Intermediate",
    content: "# Past Tense\n\nThe past tense describes actions that have already happened.\n\n## Simple Past\n- Regular: walked, talked, played\n- Irregular: went, saw, did\n\n## Past Continuous\n- I **was walking**\n- They **were talking**",
    examples: JSON.stringify([
      { text: "I walked to school yesterday", translation: "Caminé a la escuela ayer" },
      { text: "She was reading when I called", translation: "Ella estaba leyendo cuando llamé" },
      { text: "They went to the park", translation: "Fueron al parque" },
    ]),
    order: 4,
  },
  {
    title: "Advanced Vocabulary",
    description: "Expand your vocabulary with advanced terms",
    category: "Vocabulary",
    difficulty: "Advanced",
    content: "# Advanced Vocabulary\n\nThese words are commonly used in professional and academic contexts:\n\n- **Eloquent** - Fluent and persuasive in speaking or writing\n- **Pragmatic** - Dealing with things in a practical, realistic way\n- **Meticulous** - Showing great attention to detail\n- **Ambiguous** - Open to more than one interpretation",
    examples: JSON.stringify([
      { text: "Her eloquent speech impressed everyone", translation: "Su discurso elocuente impresionó a todos" },
      { text: "A pragmatic approach to problem-solving", translation: "Un enfoque pragmático para resolver problemas" },
      { text: "His meticulous work was flawless", translation: "Su trabajo meticuloso fue impecable" },
    ]),
    order: 5,
  },
];

// Sample quiz questions
const quizQuestions = [
  {
    lessonId: 1,
    question: "What is the most common greeting in English?",
    type: "multiple_choice",
    options: JSON.stringify(["Hello", "Goodbye", "Thank you", "Please"]),
    correctAnswer: "Hello",
    explanation: "Hello is the most universal and common greeting in English.",
    order: 1,
  },
  {
    lessonId: 1,
    question: "Fill in the blank: Good ___, how are you?",
    type: "fill_in_blank",
    correctAnswer: "morning",
    explanation: "Good morning is used as a greeting before noon.",
    order: 2,
  },
  {
    lessonId: 2,
    question: "Which sentence uses the present tense correctly?",
    type: "multiple_choice",
    options: JSON.stringify([
      "I speaks English",
      "She speak English",
      "He speaks English",
      "They speaks English",
    ]),
    correctAnswer: "He speaks English",
    explanation: "With third person singular (he/she/it), we add 's' to the verb.",
    order: 1,
  },
  {
    lessonId: 2,
    question: "Fill in: She ___ speaking right now.",
    type: "fill_in_blank",
    correctAnswer: "is",
    explanation: "With 'she' (singular), we use 'is' in the present continuous.",
    order: 2,
  },
  {
    lessonId: 3,
    question: "What do you say when someone thanks you?",
    type: "multiple_choice",
    options: JSON.stringify([
      "You're welcome",
      "Thank you",
      "Hello",
      "Goodbye",
    ]),
    correctAnswer: "You're welcome",
    explanation: "You're welcome is the polite response to being thanked.",
    order: 1,
  },
  {
    lessonId: 4,
    question: "Which is an irregular past tense verb?",
    type: "multiple_choice",
    options: JSON.stringify(["walked", "talked", "went", "played"]),
    correctAnswer: "went",
    explanation: "Went is the past tense of 'go', which is irregular.",
    order: 1,
  },
  {
    lessonId: 5,
    question: "What does 'eloquent' mean?",
    type: "multiple_choice",
    options: JSON.stringify([
      "Fluent and persuasive in speaking",
      "Shy and quiet",
      "Loud and aggressive",
      "Confused and unclear",
    ]),
    correctAnswer: "Fluent and persuasive in speaking",
    explanation: "Eloquent describes someone who speaks fluently and persuasively.",
    order: 1,
  },
];

// Sample achievements
const achievements = [
  {
    name: "First Steps",
    description: "Complete your first lesson",
    icon: "🎯",
    criteria: JSON.stringify({ type: "first_lesson" }),
  },
  {
    name: "Quick Learner",
    description: "Score 100% on a quiz",
    icon: "⚡",
    criteria: JSON.stringify({ type: "perfect_score" }),
  },
  {
    name: "Dedicated Learner",
    description: "Maintain a 7-day learning streak",
    icon: "🔥",
    criteria: JSON.stringify({ type: "streak", days: 7 }),
  },
  {
    name: "Polyglot",
    description: "Complete lessons in all categories",
    icon: "🌍",
    criteria: JSON.stringify({ type: "all_categories" }),
  },
  {
    name: "Master",
    description: "Complete all lessons",
    icon: "👑",
    criteria: JSON.stringify({ type: "all_lessons" }),
  },
];

try {
  console.log("Starting database seeding...");

  // Insert lessons
  console.log("Inserting lessons...");
  for (const lesson of lessons) {
    await connection.execute(
      `INSERT INTO lessons (title, description, category, difficulty, content, examples, \`order\`)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        lesson.title,
        lesson.description,
        lesson.category,
        lesson.difficulty,
        lesson.content,
        lesson.examples,
        lesson.order,
      ]
    );
  }

  // Get inserted lesson IDs
  const [lessonRows] = await connection.execute("SELECT id FROM lessons ORDER BY id");
  const lessonIds = lessonRows.map((row) => row.id);

  // Insert quiz questions
  console.log("Inserting quiz questions...");
  for (const question of quizQuestions) {
    await connection.execute(
      `INSERT INTO quiz_questions (lessonId, question, type, options, correctAnswer, explanation, \`order\`)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        question.lessonId,
        question.question,
        question.type,
        question.options || null,
        question.correctAnswer,
        question.explanation || null,
        question.order,
      ]
    );
  }

  // Insert achievements
  console.log("Inserting achievements...");
  for (const achievement of achievements) {
    await connection.execute(
      `INSERT INTO achievements (name, description, icon, criteria)
       VALUES (?, ?, ?, ?)`,
      [achievement.name, achievement.description, achievement.icon, achievement.criteria]
    );
  }

  console.log("✅ Database seeding completed successfully!");
  console.log(`✅ Inserted ${lessons.length} lessons`);
  console.log(`✅ Inserted ${quizQuestions.length} quiz questions`);
  console.log(`✅ Inserted ${achievements.length} achievements`);

  await connection.end();
} catch (error) {
  console.error("❌ Error seeding database:", error);
  process.exit(1);
}
