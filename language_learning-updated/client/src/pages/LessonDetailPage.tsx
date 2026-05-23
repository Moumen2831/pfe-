import { useParams, Link } from "wouter";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, BookOpen, Play, CheckCircle } from "lucide-react";
import { Streamdown } from "streamdown";
import { LessonRenderer } from "@/components/lessons/LessonRenderer";
import type { DynamicLesson, LessonBlock } from "@/types/lesson.types";
import { toast } from "sonner";

export default function LessonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const lessonId = parseInt(id || "0", 10);
  const { data: lesson, isLoading } = trpc.lessons.byId.useQuery({ id: lessonId });
  const { data: progress } = trpc.progress.getProgress.useQuery(
    { lessonId },
    { enabled: isAuthenticated }
  );
  const updateProgress = trpc.progress.updateLesson.useMutation({
    onSuccess: () => toast.success("Progress saved."),
    onError: (error) => toast.error(error.message),
  });

  const examples = lesson?.examples ? JSON.parse(lesson.examples) : [];
  const currentCard = examples[currentCardIndex];
  const dynamicLesson = normalizeDynamicLesson(lesson);

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

  if (!lesson) {
    return (
      <div className="min-h-screen py-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-2xl font-bold mb-4">Lesson not found</h1>
          <Button asChild>
            <Link href="/lessons">Back to Lessons</Link>
          </Button>
        </div>
      </div>
    );
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Beginner":
        return "bg-blue-100 text-blue-800";
      case "Intermediate":
        return "bg-purple-100 text-purple-800";
      case "Advanced":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  function handleBlockComplete(block: LessonBlock, result?: unknown) {
    if (!isAuthenticated) {
      toast.info("Sign in to save your lesson progress.");
      return;
    }

    const totalBlocks = dynamicLesson?.blocks.length ?? 1;
    const blockIndex = dynamicLesson?.blocks.findIndex(item => item.id === block.id) ?? 0;
    const completionPercentage = Math.min(100, Math.round(((blockIndex + 1) / totalBlocks) * 100));
    const score = typeof result === "object" && result && "score" in result
      ? Number((result as { score?: number }).score)
      : undefined;

    updateProgress.mutate({
      lessonId,
      status: completionPercentage >= 100 ? "completed" : "in_progress",
      completionPercentage,
      ...(block.type === "vocabulary" ? { vocabularyScore: score ?? 100 } : {}),
      ...(block.type === "grammar" ? { grammarScore: score ?? 100 } : {}),
      ...(block.type === "listening" ? { listeningScore: score ?? 0 } : {}),
      ...(block.type === "speaking" ? { speakingScore: score ?? 0 } : {}),
      ...(block.type === "quiz" ? { quizScore: score ?? 0, score: score ?? 0 } : {}),
    });
  }

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <Button asChild variant="ghost" className="mb-4">
            <Link href="/lessons" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Lessons
            </Link>
          </Button>

          <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold mb-2">{lesson.title}</h1>
            <p className="text-lg text-muted-foreground">{lesson.description}</p>
          </div>
            <div className="flex flex-col items-end gap-2">
              <span className={`px-4 py-2 rounded-full text-sm font-medium ${getDifficultyColor(lesson.difficulty)}`}>
                {lesson.difficulty}
              </span>
              {progress?.completed && (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">Completed</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="px-3 py-1 bg-muted rounded-full">{lesson.category}</span>
            {lesson.cefrLevel && <span className="px-3 py-1 bg-muted rounded-full">{lesson.cefrLevel}</span>}
            {lesson.skillFocus && <span className="px-3 py-1 bg-muted rounded-full">{lesson.skillFocus}</span>}
          </div>
        </div>

        {/* Content */}
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {dynamicLesson ? (
              <LessonRenderer
                lesson={dynamicLesson}
                onBlockComplete={(block, result) => handleBlockComplete(block, result)}
              />
            ) : (
              <div className="card-elegant p-8 mb-8 animate-slideUp">
                <h2 className="text-2xl font-semibold mb-6">Lesson Content</h2>
                <div className="prose prose-sm max-w-none">
                  <Streamdown>{lesson.content}</Streamdown>
                </div>
              </div>
            )}

            {/* Examples */}
            {examples.length > 0 && (
              <div className="card-elegant p-8 mb-8 animate-slideUp" style={{ animationDelay: "0.1s" }}>
                <h2 className="text-2xl font-semibold mb-6">Examples</h2>
                <div className="space-y-4">
                  {examples.map((example: any, index: number) => (
                    <div key={index} className="p-4 bg-muted/50 rounded-lg border border-border">
                      <p className="font-medium mb-2">{example.text}</p>
                      {example.translation && (
                        <p className="text-sm text-muted-foreground italic">{example.translation}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quiz Button */}
            {isAuthenticated && (
              <Button asChild size="lg" className="w-full gap-2 mb-8">
                <Link href={`/quiz/${lessonId}`}>
                  <Play className="w-5 h-5" />
                  Take the Quiz
                </Link>
              </Button>
            )}
          </div>

          {/* Sidebar - Flashcards */}
          <div className="lg:col-span-1">
            <div className="card-elegant p-6 sticky top-24 animate-slideUp" style={{ animationDelay: "0.2s" }}>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Vocabulary Practice
              </h3>

              {examples.length > 0 ? (
                <>
                  {!showFlashcards ? (
                    <Button
                      onClick={() => setShowFlashcards(true)}
                      className="w-full gap-2"
                    >
                      <Play className="w-4 h-4" />
                      Start Flashcards
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      {/* Flashcard with 3D Flip Animation */}
                      <div
                        className="h-48 cursor-pointer"
                        onClick={() => setIsFlipped(!isFlipped)}
                        style={{
                          perspective: "1000px",
                        }}
                      >
                        <div
                          style={{
                            transformStyle: "preserve-3d",
                            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                            transition: "transform 0.6s ease-in-out",
                            width: "100%",
                            height: "100%",
                          }}
                        >
                          {/* Front of card */}
                          <div
                            className="absolute w-full h-full bg-gradient-to-br from-primary/10 to-secondary/10 rounded-lg border-2 border-primary/20 flex items-center justify-center hover:shadow-lg transition-shadow"
                            style={{ backfaceVisibility: "hidden" }}
                          >
                            <div className="text-center px-4">
                              <p className="text-xs text-muted-foreground mb-2">Word</p>
                              <p className="text-xl font-semibold">{currentCard?.text}</p>
                            </div>
                          </div>
                          {/* Back of card */}
                          <div
                            className="absolute w-full h-full bg-gradient-to-br from-secondary/10 to-primary/10 rounded-lg border-2 border-secondary/20 flex items-center justify-center hover:shadow-lg transition-shadow"
                            style={{
                              backfaceVisibility: "hidden",
                              transform: "rotateY(180deg)",
                            }}
                          >
                            <div className="text-center px-4">
                              <p className="text-xs text-muted-foreground mb-2">Translation</p>
                              <p className="text-xl font-semibold">{currentCard?.translation}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Navigation */}
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{currentCardIndex + 1} / {examples.length}</span>
                        <span className="text-xs">Click to flip</span>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCurrentCardIndex(Math.max(0, currentCardIndex - 1));
                            setIsFlipped(false);
                          }}
                          disabled={currentCardIndex === 0}
                          className="flex-1"
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCurrentCardIndex(Math.min(examples.length - 1, currentCardIndex + 1));
                            setIsFlipped(false);
                          }}
                          disabled={currentCardIndex === examples.length - 1}
                          className="flex-1"
                        >
                          Next
                        </Button>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowFlashcards(false);
                          setCurrentCardIndex(0);
                          setIsFlipped(false);
                        }}
                        className="w-full"
                      >
                        Done
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No vocabulary examples available.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeDynamicLesson(lesson: any): DynamicLesson | null {
  if (!lesson?.lessonJson) return null;
  if (typeof lesson.lessonJson === "string") {
    try {
      return JSON.parse(lesson.lessonJson);
    } catch {
      return null;
    }
  }
  return lesson.lessonJson as DynamicLesson;
}
