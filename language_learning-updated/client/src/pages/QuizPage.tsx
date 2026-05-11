import { useParams, useLocation } from "wouter";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";

type QuestionType = "multiple_choice" | "fill_in_blank";

interface Question {
  id: number;
  question: string;
  type: QuestionType;
  options?: string;
  correctAnswer: string;
  explanation?: string;
}

export default function QuizPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<(string | null)[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [fillInAnswer, setFillInAnswer] = useState("");

  const id = parseInt(lessonId || "0", 10);
  const { data: questions, isLoading } = trpc.quiz.getQuestions.useQuery({ lessonId: id });
  const submitAttempt = trpc.quiz.submitAttempt.useMutation();

  const currentQuestion = questions?.[currentQuestionIndex];
  const parsedOptions = currentQuestion?.options ? JSON.parse(currentQuestion.options) : [];
  const currentAnswer = userAnswers[currentQuestionIndex];
  const isAnswerCorrect = currentAnswer?.toLowerCase().trim() === currentQuestion?.correctAnswer.toLowerCase().trim();

  const score = useMemo(() => {
    if (!questions || userAnswers.length === 0) return 0;
    let correct = 0;
    questions.forEach((q, idx) => {
      if (userAnswers[idx]?.toLowerCase().trim() === q.correctAnswer.toLowerCase().trim()) {
        correct++;
      }
    });
    return Math.round((correct / questions.length) * 100);
  }, [questions, userAnswers]);

  const handleSelectAnswer = (answer: string) => {
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestionIndex] = answer;
    setUserAnswers(newAnswers);
    setShowFeedback(true);
  };

  const handleFillInChange = (value: string) => {
    setFillInAnswer(value);
  };

  const handleSubmitFillIn = () => {
    if (fillInAnswer.trim()) {
      handleSelectAnswer(fillInAnswer);
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < (questions?.length || 0) - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setShowFeedback(false);
      setFillInAnswer("");
    } else {
      setShowResults(true);
    }
  };

  const handleSubmitQuiz = async () => {
    if (!isAuthenticated || !questions) return;

    try {
      const correctCount = userAnswers.filter((answer, idx) => {
        return answer?.toLowerCase().trim() === questions[idx].correctAnswer.toLowerCase().trim();
      }).length;

      await submitAttempt.mutateAsync({
        lessonId: id,
        score,
        totalQuestions: questions.length,
        correctAnswers: correctCount,
        answers: userAnswers,
      });

      toast.success("Quiz submitted successfully!");
      setTimeout(() => navigate(`/lesson/${id}`), 1500);
    } catch (error) {
      toast.error("Failed to submit quiz. Please try again.");
    }
  };

  const handleRetry = () => {
    setCurrentQuestionIndex(0);
    setUserAnswers([]);
    setShowResults(false);
    setShowFeedback(false);
    setFillInAnswer("");
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen py-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-2xl font-bold mb-4">Please log in to take the quiz</h1>
          <Button asChild>
            <a href="/login">Login</a>
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen py-12">
        <div className="container mx-auto px-4">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="min-h-screen py-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-2xl font-bold mb-4">No questions available</h1>
          <Button asChild variant="outline">
            <a href={`/lesson/${id}`}>Back to Lesson</a>
          </Button>
        </div>
      </div>
    );
  }

  if (showResults) {
    const correctCount = userAnswers.filter((answer, idx) => {
      return answer?.toLowerCase().trim() === questions[idx].correctAnswer.toLowerCase().trim();
    }).length;

    return (
      <div className="min-h-screen py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            {/* Results Summary */}
            <div className="card-elegant p-8 mb-8 text-center animate-slideUp">
              <div className="mb-6">
                <div className="text-6xl font-bold text-gradient mb-2">{score}%</div>
                <h1 className="text-3xl font-bold mb-2">Quiz Complete!</h1>
                <p className="text-lg text-muted-foreground">
                  You got {correctCount} out of {questions.length} questions correct.
                </p>
              </div>

              <div className="mb-8">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${score}%` }}></div>
                </div>
              </div>

              <div className="flex gap-4 justify-center">
                <Button onClick={handleRetry} variant="outline" className="gap-2">
                  <RotateCcw className="w-4 h-4" />
                  Try Again
                </Button>
                <Button asChild className="gap-2">
                  <a href={`/lesson/${id}`}>
                    <ArrowLeft className="w-4 h-4" />
                    Back to Lesson
                  </a>
                </Button>
              </div>
            </div>

            {/* Detailed Review */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold mb-6">Review Your Answers</h2>
              {questions.map((question, idx) => {
                const userAnswer = userAnswers[idx];
                const isCorrect = userAnswer?.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim();

                return (
                  <div
                    key={question.id}
                    className={`card-elegant p-6 border-l-4 ${isCorrect ? "border-green-500 bg-green-50/50" : "border-red-500 bg-red-50/50"}`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      {isCorrect ? (
                        <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                      ) : (
                        <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                      )}
                      <div className="flex-1">
                        <p className="font-semibold mb-2">{question.question}</p>
                        <div className="space-y-2 text-sm">
                          <p>
                            <span className="font-medium">Your answer:</span> {userAnswer || "No answer"}
                          </p>
                          {!isCorrect && (
                            <p>
                              <span className="font-medium">Correct answer:</span> {question.correctAnswer}
                            </p>
                          )}
                          {question.explanation && (
                            <p className="text-muted-foreground italic">{question.explanation}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Submit Button */}
            <div className="mt-8 flex gap-4">
              <Button onClick={handleSubmitQuiz} size="lg" className="flex-1">
                Submit Results
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto">
          {/* Progress */}
          <div className="mb-8 animate-slideUp">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold">Quiz</h1>
              <span className="text-lg font-semibold text-muted-foreground">
                Question {currentQuestionIndex + 1} of {questions.length}
              </span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Question Card */}
          <div className="card-elegant p-8 animate-slideUp" style={{ animationDelay: "0.1s" }}>
            <h2 className="text-2xl font-semibold mb-8">{currentQuestion?.question}</h2>

            {currentQuestion?.type === "multiple_choice" ? (
              <div className="space-y-3 mb-8">
                {parsedOptions.map((option: string, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectAnswer(option)}
                    disabled={showFeedback}
                    className={`w-full p-4 rounded-lg border-2 transition-all text-left font-medium ${
                      currentAnswer === option
                        ? isAnswerCorrect
                          ? "border-green-500 bg-green-50"
                          : "border-red-500 bg-red-50"
                        : "border-border hover:border-primary/50"
                    } ${showFeedback ? "cursor-default" : "cursor-pointer"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{option}</span>
                      {showFeedback && currentAnswer === option && (
                        isAnswerCorrect ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-600" />
                        )
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mb-8">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={fillInAnswer}
                    onChange={(e) => handleFillInChange(e.target.value)}
                    placeholder="Type your answer here..."
                    disabled={showFeedback}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 focus:outline-none transition-colors ${
                      showFeedback
                        ? isAnswerCorrect
                          ? "border-green-500 bg-green-50"
                          : "border-red-500 bg-red-50"
                        : "border-border focus:border-primary"
                    }`}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && !showFeedback) handleSubmitFillIn();
                    }}
                  />
                  {!showFeedback && (
                    <Button onClick={handleSubmitFillIn} disabled={!fillInAnswer.trim()}>
                      Check
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Immediate Feedback */}
            {showFeedback && (
              <div className={`p-4 rounded-lg mb-8 animate-slideUp ${
                isAnswerCorrect
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}>
                <div className="flex items-start gap-3">
                  {isAnswerCorrect ? (
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`font-semibold ${isAnswerCorrect ? "text-green-900" : "text-red-900"}`}>
                      {isAnswerCorrect ? "Correct!" : "Incorrect"}
                    </p>
                    {!isAnswerCorrect && (
                      <p className="text-sm text-red-800 mt-1">
                        Correct answer: <span className="font-medium">{currentQuestion?.correctAnswer}</span>
                      </p>
                    )}
                    {currentQuestion?.explanation && (
                      <p className={`text-sm mt-2 ${isAnswerCorrect ? "text-green-800" : "text-red-800"}`}>
                        {currentQuestion.explanation}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={() => {
                  if (currentQuestionIndex > 0) {
                    setCurrentQuestionIndex(currentQuestionIndex - 1);
                    setShowFeedback(false);
                    setFillInAnswer("");
                  }
                }}
                disabled={currentQuestionIndex === 0}
                className="flex-1"
              >
                Previous
              </Button>
              <Button
                onClick={handleNext}
                disabled={!showFeedback}
                className="flex-1"
              >
                {currentQuestionIndex === questions.length - 1 ? "Finish" : "Next"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
