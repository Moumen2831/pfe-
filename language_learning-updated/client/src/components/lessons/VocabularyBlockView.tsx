import { Button } from "@/components/ui/button";
import type { VocabularyBlock } from "@/types/lesson.types";
import { CheckCircle } from "lucide-react";

export function VocabularyBlockView({ block, onComplete }: { block: VocabularyBlock; onComplete: () => void }) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">{block.title}</h3>
        <Button variant="outline" size="sm" onClick={onComplete}>
          <CheckCircle className="mr-2 h-4 w-4" />
          Done
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {block.items.map((item) => (
          <article key={item.word} className="rounded-md border border-border bg-muted/20 p-4">
            <h4 className="font-semibold">{item.word}</h4>
            <p className="mt-2 text-sm text-muted-foreground">{item.definition}</p>
            <p className="mt-3 text-sm">{item.example}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
