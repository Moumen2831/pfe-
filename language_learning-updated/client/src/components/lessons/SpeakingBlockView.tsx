import { Button } from "@/components/ui/button";
import type { SpeakingBlock } from "@/types/lesson.types";
import { Mic } from "lucide-react";

export function SpeakingBlockView({ block, onComplete }: { block: SpeakingBlock; onComplete: (result: unknown) => void }) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h3 className="text-lg font-semibold">{block.title}</h3>
      <p className="mt-3 text-muted-foreground">{block.instruction}</p>
      <blockquote className="mt-4 rounded-md border-l-4 border-primary bg-muted/30 p-4 text-lg">
        {block.targetText}
      </blockquote>
      <div className="mt-4 rounded-md bg-muted/20 p-4 text-sm text-muted-foreground">
        Whisper will transcribe the audio, SpeechBrain will score pronunciation and fluency, and Llama 3 will generate feedback when the speech pipeline is connected.
      </div>
      <Button className="mt-5" variant="outline" onClick={() => onComplete({ score: 0, targetText: block.targetText })}>
        <Mic className="mr-2 h-4 w-4" />
        Mark Speaking Practice
      </Button>
    </section>
  );
}
