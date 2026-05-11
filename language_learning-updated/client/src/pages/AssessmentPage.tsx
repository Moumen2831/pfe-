import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

interface TestQuestion {
  questionId: number;
  skill: string;
  text: string;
  audioUrl?: string;
  options: string[];
  correctAnswer: string;
  timeLimitSeconds: number;
}

interface UserAnswer {
  questionId: number;
  answer: string;
  timeTaken: number;
}

export default function AssessmentPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [stage, setStage] = useState<"loading" | "test" | "results">("loading");
  
  // Test state
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isAnswered, setIsAnswered] = useState(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const questionStartTimeRef = useRef<number>(0);

  // Results state
  const [skillScores, setSkillScores] = useState<Record<string, { correct: number; total: number; percentage: number }>>({});

  // Fetch test questions
  const { data: testQuestions, isLoading } = trpc.assessment.getTestQuestions.useQuery(
    { limit: 15 },
    { enabled: isAuthenticated }
  );

  // Initialize test
  useEffect(() => {
    if (testQuestions && testQuestions.length > 0) {
      setQuestions(testQuestions);
      setStage("test");
      startQuestion(0);
    }
  }, [testQuestions]);

  // Timer logic
  useEffect(() => {
    if (stage !== "test" || isAnswered) return;

    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    setTimeRemaining(currentQuestion.timeLimitSeconds);

    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Auto-advance when time runs out
          handleAutoAdvance();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [stage, currentQuestionIndex, isAnswered, questions]);

  const startQuestion = (index: number) => {
    setCurrentQuestionIndex(index);
    setSelectedAnswer("");
    setIsAnswered(false);
    questionStartTimeRef.current = Date.now();
  };

  const handleAutoAdvance = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    
    const timeTaken = Math.round((Date.now() - questionStartTimeRef.current) / 1000);
    const currentQuestion = questions[currentQuestionIndex];
    
    // Save answer (or mark as unanswered)
    setUserAnswers([
      ...userAnswers,
      {
        questionId: currentQuestion.questionId,
        answer: selectedAnswer || "unanswered",
        timeTaken,
      },
    ]);

    // Move to next question or finish
    if (currentQuestionIndex < questions.length - 1) {
      startQuestion(currentQuestionIndex + 1);
    } else {
      finishTest();
    }
  };

  const handleAnswerSelect = (answer: string) => {
    setSelectedAnswer(answer);
  };

  const handleNext = () => {
    if (!selectedAnswer) return;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    const timeTaken = Math.round((Date.now() - questionStartTimeRef.current) / 1000);
    const currentQuestion = questions[currentQuestionIndex];

    setUserAnswers([
      ...userAnswers,
      {
        questionId: currentQuestion.questionId,
        answer: selectedAnswer,
        timeTaken,
      },
    ]);

    if (currentQuestionIndex < questions.length - 1) {
      startQuestion(currentQuestionIndex + 1);
    } else {
      finishTest();
    }
  };

  const handleSkip = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    const timeTaken = Math.round((Date.now() - questionStartTimeRef.current) / 1000);
    const currentQuestion = questions[currentQuestionIndex];

    setUserAnswers([
      ...userAnswers,
      {
        questionId: currentQuestion.questionId,
        answer: "skipped",
        timeTaken,
      },
    ]);

    if (currentQuestionIndex < questions.length - 1) {
      startQuestion(currentQuestionIndex + 1);
    } else {
      finishTest();
    }
  };

  const finishTest = () => {
    // Calculate scores by skill
    const scores: Record<string, { correct: number; total: number }> = {};

    questions.forEach((question, index) => {
      const userAnswer = userAnswers[index];
      if (!scores[question.skill]) {
        scores[question.skill] = { correct: 0, total: 0 };
      }

      scores[question.skill].total++;

      if (userAnswer && userAnswer.answer === question.correctAnswer) {
        scores[question.skill].correct++;
      }
    });

    // Convert to percentages
    const skillScoresWithPercentage: Record<string, { correct: number; total: number; percentage: number }> = {};
    Object.entries(scores).forEach(([skill, score]) => {
      skillScoresWithPercentage[skill] = {
        ...score,
        percentage: Math.round((score.correct / score.total) * 100),
      };
    });

    setSkillScores(skillScoresWithPercentage);
    setStage("results");
  };

  const currentQuestion = questions[currentQuestionIndex];
  const isTextInput = currentQuestion?.correctAnswer === "text";
  const timerColor = timeRemaining <= 10 ? "text-red-500" : "text-cyan-400";

  // Save to local storage for auto-save
  useEffect(() => {
    if (stage === "test" && questions.length > 0) {
      localStorage.setItem(
        "assessmentProgress",
        JSON.stringify({
          currentQuestionIndex,
          userAnswers,
          questions,
          timestamp: Date.now(),
        })
      );
    }
  }, [currentQuestionIndex, userAnswers, stage, questions]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0a0f1e" }}>
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-white">Please log in to take the assessment</h1>
          <button
            onClick={() => navigate("/dashboard")}
            className="px-6 py-2 bg-cyan-500 text-white rounded-lg font-semibold hover:bg-cyan-600 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || stage === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0a0f1e" }}>
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-cyan-400 mx-auto mb-4" />
          <p className="text-white text-lg">Loading assessment...</p>
        </div>
      </div>
    );
  }

  if (stage === "results") {
    const totalCorrect = Object.values(skillScores).reduce((sum, score) => sum + score.correct, 0);
    const totalQuestions = Object.values(skillScores).reduce((sum, score) => sum + score.total, 0);
    const overallPercentage = Math.round((totalCorrect / totalQuestions) * 100);

    const skillNames: Record<string, string> = {
      listening: "Compréhension orale (Listening)",
      reading: "Compréhension écrite (Reading)",
      speaking: "Production orale (Speaking)",
      writing: "Production écrite (Writing)",
    };

    return (
      <div className="min-h-screen text-on-surface overflow-hidden" style={{ backgroundColor: "#0a0f1e" }}>
        {/* Background */}
        <div className="fixed top-[-200px] right-[-100px] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 blur-[120px] opacity-20 z-0 pointer-events-none"></div>
        <div className="fixed bottom-[-200px] left-[-100px] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-cyan-500 via-blue-500 to-indigo-500 blur-[120px] opacity-20 z-0 pointer-events-none"></div>

        <main className="relative z-10 p-8 max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-extrabold mb-2 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Assessment Complete!
            </h1>
            <p className="text-on-surface-variant">Your TCF-style test results</p>
          </div>

          {/* Overall Score */}
          <div className="glass-card rounded-[2rem] p-8 border border-white/10 mb-8 text-center">
            <div className="mb-6">
              <div className="text-6xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
                {overallPercentage}%
              </div>
              <p className="text-on-surface-variant text-lg">
                {totalCorrect} out of {totalQuestions} correct
              </p>
            </div>

            {/* Performance Level */}
            <div className="inline-block px-6 py-3 rounded-full bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/40">
              {overallPercentage >= 80 && <span className="text-cyan-400 font-bold">Excellent Performance!</span>}
              {overallPercentage >= 60 && overallPercentage < 80 && <span className="text-blue-400 font-bold">Good Performance</span>}
              {overallPercentage >= 40 && overallPercentage < 60 && <span className="text-purple-400 font-bold">Fair Performance</span>}
              {overallPercentage < 40 && <span className="text-pink-400 font-bold">Keep Practicing</span>}
            </div>
          </div>

          {/* Skill-wise Scores */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
              Skill-wise Breakdown
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.entries(skillScores).map(([skill, score]) => {
                const skillName = skillNames[skill] || skill;
                const gradient =
                  skill === "listening"
                    ? "from-cyan-400 to-blue-500"
                    : skill === "reading"
                    ? "from-pink-400 to-rose-500"
                    : skill === "speaking"
                    ? "from-purple-400 to-indigo-500"
                    : "from-emerald-400 to-teal-500";

                return (
                  <div key={skill} className="glass-card rounded-[2rem] p-6 border border-white/10">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className={`font-bold bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>
                        {skillName}
                      </h3>
                      <span className={`text-2xl font-black bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>
                        {score.percentage}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-on-surface-variant mb-4">
                      <span>{score.correct} correct</span>
                      <span>•</span>
                      <span>{score.total} total</span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/10">
                      <div
                        className={`h-full bg-gradient-to-r ${gradient} rounded-full`}
                        style={{ width: `${score.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => navigate("/dashboard")}
              className="px-8 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/50 transition-all"
            >
              Back to Dashboard
            </button>
            <button
              onClick={() => {
                localStorage.removeItem("assessmentProgress");
                setStage("loading");
                setCurrentQuestionIndex(0);
                setUserAnswers([]);
                setSelectedAnswer("");
              }}
              className="px-8 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-purple-500 to-indigo-500 hover:shadow-lg hover:shadow-purple-500/50 transition-all"
            >
              Retake Assessment
            </button>
          </div>
        </main>

        {/* Styles */}
        <style>{`
          .glass-card {
            background: rgba(71, 98, 150, 0.35);
            backdrop-filter: blur(24px);
            border-top: 1px solid rgba(147, 172, 216, 0.15);
            border-left: 1px solid rgba(147, 172, 216, 0.15);
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-on-surface overflow-hidden" style={{ backgroundColor: "#0a0f1e" }}>
      {/* Background */}
      <div className="fixed top-[-200px] right-[-100px] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 blur-[120px] opacity-20 z-0 pointer-events-none"></div>
      <div className="fixed bottom-[-200px] left-[-100px] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-cyan-500 via-blue-500 to-indigo-500 blur-[120px] opacity-20 z-0 pointer-events-none"></div>

      <main className="relative z-10 p-8 max-w-4xl mx-auto">
        {/* Header with progress and timer */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              TCF Assessment
            </h1>
            <p className="text-on-surface-variant mt-1">
              Question {currentQuestionIndex + 1} of {questions.length} • Skill: <span className="font-semibold text-cyan-400">{currentQuestion?.skill.toUpperCase()}</span>
            </p>
          </div>

          {/* Timer */}
          <div className={`text-center p-4 glass-card rounded-2xl border border-white/10 ${timerColor}`}>
            <div className={`text-4xl font-black ${timerColor}`}>
              {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, "0")}
            </div>
            <p className="text-xs text-on-surface-variant mt-1">Time Remaining</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-8 h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/10">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
          ></div>
        </div>

        {/* Question Card */}
        <div className="glass-card rounded-[2rem] p-8 border border-white/10 mb-8">
          {/* Question Text */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-white mb-4">{currentQuestion?.text}</h2>

            {/* Audio player for listening */}
            {currentQuestion?.audioUrl && currentQuestion.skill === "listening" && (
              <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/10">
                <audio controls className="w-full">
                  <source src={currentQuestion.audioUrl} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}
          </div>

          {/* Answer Options */}
          {!isTextInput ? (
            <div className="space-y-3 mb-8">
              {currentQuestion?.options.map((option, index) => {
                const answerKey = String.fromCharCode(65 + index); // A, B, C, D
                return (
                  <label
                    key={index}
                    className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedAnswer === answerKey
                        ? "bg-cyan-500/20 border-cyan-500 shadow-lg shadow-cyan-500/30"
                        : "bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10"
                    }`}
                  >
                    <input
                      type="radio"
                      name="answer"
                      value={answerKey}
                      checked={selectedAnswer === answerKey}
                      onChange={(e) => handleAnswerSelect(e.target.value)}
                      className="w-5 h-5 cursor-pointer"
                    />
                    <span className="ml-4 font-semibold">{answerKey}.</span>
                    <span className="ml-3">{option}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            // Text input for speaking/writing
            <textarea
              value={selectedAnswer}
              onChange={(e) => handleAnswerSelect(e.target.value)}
              placeholder="Type your answer here..."
              className="w-full p-4 rounded-lg bg-white/5 border border-white/10 text-white placeholder-on-surface-variant focus:border-cyan-500 focus:outline-none mb-8 resize-none h-32"
            />
          )}

          {/* Buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleSkip}
              className="flex-1 px-6 py-3 rounded-lg font-semibold text-on-surface-variant bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
            >
              Skip Question
            </button>
            <button
              onClick={handleNext}
              disabled={!selectedAnswer}
              className={`flex-1 px-6 py-3 rounded-lg font-semibold text-white transition-all ${
                selectedAnswer
                  ? "bg-gradient-to-r from-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/50"
                  : "bg-gray-600 opacity-50 cursor-not-allowed"
              }`}
            >
              {currentQuestionIndex === questions.length - 1 ? "Finish Assessment" : "Next Question"}
            </button>
          </div>
        </div>
      </main>

      {/* Styles */}
      <style>{`
        .glass-card {
          background: rgba(71, 98, 150, 0.35);
          backdrop-filter: blur(24px);
          border-top: 1px solid rgba(147, 172, 216, 0.15);
          border-left: 1px solid rgba(147, 172, 216, 0.15);
        }
        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
      `}</style>
    </div>
  );
}
