import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ListeningBlock } from "@/types/lesson.types";
import { Volume2 } from "lucide-react";

export function ListeningBlockView({ block, onComplete }: { block: ListeningBlock; onComplete: (result: unknown) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const score = useMemo(() => {
    if (block.questions.length === 0) return 0;
    const correct = block.questions.filter((question, index) => answers[question.id ?? String(index)] === String(question.correctAnswer)).length;
    return Math.round((correct / block.questions.length) * 100);
  }, [answers, block.questions]);

  function playText() {
    const utterance = new SpeechSynthesisUtterance(block.audioText);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">{block.title}</h3>
        <Button variant="outline" size="sm" onClick={playText}>
          <Volume2 className="mr-2 h-4 w-4" />
          Play
        </Button>
      </div>
      <div className="mt-5 space-y-4">
        {block.questions.map((question, index) => {
          const key = question.id ?? String(index);
          return (
            <div key={`${block.id}-${key}-${index}`} className="rounded-md border border-border p-4">
              <p className="font-medium">{question.question}</p>
              <div className="mt-3 grid gap-2">
                {question.options?.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`rounded-md border px-3 py-2 text-left text-sm ${answers[key] === option ? "border-primary bg-primary/10" : "border-border"}`}
                    onClick={() => setAnswers(prev => ({ ...prev, [key]: option }))}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Button className="mt-5" onClick={() => onComplete({ score, answers })}>Submit Listening</Button>
    </section>
  );
}
