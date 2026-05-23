import { Button } from "@/components/ui/button";
import type { GrammarBlock } from "@/types/lesson.types";

export function GrammarBlockView({ block, onComplete }: { block: GrammarBlock; onComplete: () => void }) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h3 className="text-lg font-semibold">{block.title}</h3>
      <p className="mt-3 text-muted-foreground">{block.explanation}</p>
      <div className="mt-4 grid gap-2">
        {block.examples.map((example) => (
          <p key={example} className="rounded-md bg-muted/30 px-3 py-2 text-sm">{example}</p>
        ))}
      </div>
      {block.sections && block.sections.length > 0 && (
        <div className="mt-6 space-y-5">
          {block.sections.map((section) => (
            <section key={section.heading} className="rounded-md border border-border p-4">
              <h4 className="font-semibold">{section.heading}</h4>
              <p className="mt-2 text-sm text-muted-foreground">{section.explanation}</p>
              {section.examples && section.examples.length > 0 && (
                <div className="mt-3 space-y-2">
                  {section.examples.map((example) => (
                    <blockquote key={example} className="border-l-4 border-primary pl-3 text-sm">
                      {example}
                    </blockquote>
                  ))}
                </div>
              )}
              {section.table && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        {section.table.headers.map((header) => (
                          <th key={header} className="border border-border bg-muted/40 px-3 py-2 text-left">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {row.map((cell, cellIndex) => (
                            <td key={`${rowIndex}-${cellIndex}`} className="border border-border px-3 py-2">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      {block.commonMistakes && block.commonMistakes.length > 0 && (
        <div className="mt-6 rounded-md border border-border bg-muted/20 p-4">
          <h4 className="font-semibold">Common mistakes</h4>
          <div className="mt-3 space-y-3">
            {block.commonMistakes.map((mistake) => (
              <div key={mistake.incorrect} className="text-sm">
                <p><span className="font-medium">Not:</span> {mistake.incorrect}</p>
                <p><span className="font-medium">Use:</span> {mistake.correct}</p>
                <p className="text-muted-foreground">{mistake.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-5 space-y-3">
        {block.practice.map((item) => (
          <div key={item.prompt} className="rounded-md border border-border p-4">
            <p className="font-medium">{item.prompt}</p>
            <p className="mt-2 text-sm text-muted-foreground">Expected: {item.expectedAnswer}</p>
          </div>
        ))}
      </div>
      <Button className="mt-5" variant="outline" onClick={onComplete}>Mark Grammar Complete</Button>
    </section>
  );
}
