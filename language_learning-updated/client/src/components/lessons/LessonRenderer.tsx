import type { DynamicLesson, LessonBlock } from "@/types/lesson.types";
import { VocabularyBlockView } from "./VocabularyBlockView";
import { GrammarBlockView } from "./GrammarBlockView";
import { DialogueBlockView } from "./DialogueBlockView";
import { ListeningBlockView } from "./ListeningBlockView";
import { SpeakingBlockView } from "./SpeakingBlockView";
import { QuizBlockView } from "./QuizBlockView";

type LessonRendererProps = {
  lesson: DynamicLesson;
  onBlockComplete?: (block: LessonBlock, result?: unknown) => void;
};

export function LessonRenderer({ lesson, onBlockComplete }: LessonRendererProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/20 p-5">
        <div className="flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
          <span>{lesson.cefrLevel}</span>
          <span>{lesson.topic}</span>
          <span>{lesson.skillFocus}</span>
          <span>{lesson.estimatedDurationMinutes} min</span>
        </div>
        {lesson.leadIn && (
          <p className="mt-3 text-base text-foreground">{lesson.leadIn}</p>
        )}
        {lesson.exampleSentences && lesson.exampleSentences.length > 0 && (
          <div className="mt-4 rounded-md border border-border bg-background p-4">
            <h2 className="text-sm font-semibold">Examples</h2>
            <div className="mt-3 space-y-2">
              {lesson.exampleSentences.map((example) => (
                <blockquote key={example} className="border-l-4 border-primary pl-3 text-sm">
                  {example}
                </blockquote>
              ))}
            </div>
          </div>
        )}
        <h2 className="mt-3 text-xl font-semibold">Learning objectives</h2>
        <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
          {lesson.learningObjectives.map((objective) => (
            <li key={objective} className="rounded-md bg-background px-3 py-2">
              {objective}
            </li>
          ))}
        </ul>
      </div>

      {lesson.blocks.map((block) => {
        const complete = (result?: unknown) => onBlockComplete?.(block, result);

        if (block.type === "vocabulary") return <VocabularyBlockView key={block.id} block={block} onComplete={complete} />;
        if (block.type === "grammar") return <GrammarBlockView key={block.id} block={block} onComplete={complete} />;
        if (block.type === "dialogue") return <DialogueBlockView key={block.id} block={block} onComplete={complete} />;
        if (block.type === "listening") return <ListeningBlockView key={block.id} block={block} onComplete={complete} />;
        if (block.type === "speaking") return <SpeakingBlockView key={block.id} block={block} onComplete={complete} />;
        if (block.type === "quiz") return <QuizBlockView key={block.id} block={block} onComplete={complete} />;

        return null;
      })}
    </div>
  );
}
