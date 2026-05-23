import { Button } from "@/components/ui/button";
import type { DialogueBlock } from "@/types/lesson.types";

export function DialogueBlockView({ block, onComplete }: { block: DialogueBlock; onComplete: () => void }) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h3 className="text-lg font-semibold">{block.title}</h3>
      <div className="mt-4 space-y-3">
        {block.lines.map((line, index) => (
          <div key={`${line.speaker}-${index}`} className="rounded-md bg-muted/25 p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">{line.speaker}</p>
            <p className="mt-1">{line.text}</p>
          </div>
        ))}
      </div>
      <Button className="mt-5" variant="outline" onClick={onComplete}>Complete Dialogue</Button>
    </section>
  );
}
