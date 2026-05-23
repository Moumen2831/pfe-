import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { BookOpen, Filter, ChevronRight, Wand2 } from "lucide-react";
import { toast } from "sonner";

type DifficultyLevel = "Beginner" | "Intermediate" | "Advanced";
type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
type LessonSkill = "vocabulary" | "grammar" | "dialogue" | "listening" | "speaking" | "mixed";

export default function LessonsPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel | null>(null);
  const [topic, setTopic] = useState("restaurant");
  const [cefrLevel, setCefrLevel] = useState<CefrLevel>("A2");
  const [skillFocus, setSkillFocus] = useState<LessonSkill>("mixed");

  const utils = trpc.useUtils();
  const { data: allLessons, isLoading } = trpc.lessons.all.useQuery();
  const generateLesson = trpc.lessons.generate.useMutation({
    onSuccess: async () => {
      await utils.lessons.all.invalidate();
      toast.success("Dynamic lesson generated and saved as a draft.");
    },
    onError: (error) => toast.error(error.message),
  });

  const categories = useMemo(() => {
    if (!allLessons) return [];
    return Array.from(new Set(allLessons.map(l => l.category)));
  }, [allLessons]);

  const filteredLessons = useMemo(() => {
    if (!allLessons) return [];
    return allLessons.filter(lesson => {
      if (selectedCategory && lesson.category !== selectedCategory) return false;
      if (selectedDifficulty && lesson.difficulty !== selectedDifficulty) return false;
      return true;
    });
  }, [allLessons, selectedCategory, selectedDifficulty]);

  const getDifficultyBadgeClass = (difficulty: string) => {
    switch (difficulty) {
      case "Beginner":
        return "badge-beginner";
      case "Intermediate":
        return "badge-intermediate";
      case "Advanced":
        return "badge-advanced";
      default:
        return "badge-beginner";
    }
  };

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-12 animate-slideUp">
          <h1 className="text-4xl font-bold mb-2">Language Lessons</h1>
          <p className="text-lg text-muted-foreground">
            Choose from our carefully curated lessons organized by category and difficulty level.
          </p>
        </div>

        <div className="mb-8 rounded-lg border border-border bg-card p-6 animate-slideUp">
          <div className="mb-4 flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Generate a Dynamic Lesson</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_120px_160px_auto]">
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Topic, for example restaurant"
            />
            <select
              value={cefrLevel}
              onChange={(event) => setCefrLevel(event.target.value as CefrLevel)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {["A1", "A2", "B1", "B2", "C1", "C2"].map(level => <option key={level} value={level}>{level}</option>)}
            </select>
            <select
              value={skillFocus}
              onChange={(event) => setSkillFocus(event.target.value as LessonSkill)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {["mixed", "vocabulary", "grammar", "dialogue", "listening", "speaking"].map(skill => <option key={skill} value={skill}>{skill}</option>)}
            </select>
            <Button
              onClick={() => generateLesson.mutate({
                topic,
                cefrLevel,
                skillFocus,
                estimatedDurationMinutes: 25,
              })}
              disabled={generateLesson.isPending || topic.trim().length < 2}
              className="gap-2"
            >
              <Wand2 className="h-4 w-4" />
              {generateLesson.isPending ? "Generating" : "Generate"}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-8 p-6 bg-muted/30 rounded-lg border border-border animate-slideUp" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Filters</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium mb-3">Category</label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selectedCategory === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(null)}
                >
                  All Categories
                </Button>
                {categories.map(category => (
                  <Button
                    key={category}
                    variant={selectedCategory === category ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(category)}
                  >
                    {category}
                  </Button>
                ))}
              </div>
            </div>

            {/* Difficulty Filter */}
            <div>
              <label className="block text-sm font-medium mb-3">Difficulty</label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selectedDifficulty === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedDifficulty(null)}
                >
                  All Levels
                </Button>
                {["Beginner", "Intermediate", "Advanced"].map(difficulty => (
                  <Button
                    key={difficulty}
                    variant={selectedDifficulty === difficulty ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedDifficulty(difficulty as DifficultyLevel)}
                  >
                    {difficulty}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Lessons Grid */}
        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card-elegant p-6 animate-pulse">
                <div className="h-6 bg-muted rounded mb-4 w-3/4"></div>
                <div className="h-4 bg-muted rounded mb-4 w-full"></div>
                <div className="h-4 bg-muted rounded w-2/3"></div>
              </div>
            ))}
          </div>
        ) : filteredLessons.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No lessons found</h3>
            <p className="text-muted-foreground">Try adjusting your filters to find lessons.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLessons.map((lesson, index) => (
              <Link
                key={lesson.id}
                href={`/lesson/${lesson.id}`}
                className="card-elegant p-6 hover:shadow-lg transition-all duration-200 cursor-pointer group animate-slideUp"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
                      {lesson.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">{lesson.category}</p>
                    {lesson.cefrLevel && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {lesson.cefrLevel} · {lesson.skillFocus ?? "mixed"}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>

                {lesson.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {lesson.description}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <span className={getDifficultyBadgeClass(lesson.difficulty)}>
                    {lesson.difficulty}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
