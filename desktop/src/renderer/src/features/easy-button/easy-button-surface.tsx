import { Sparkles } from "lucide-react";

export function EasyButtonSurface() {
  return (
    <section
      aria-label="Easy Button"
      className="easy-button-surface"
      data-easy-button-state="idle"
      data-testid="easy-button-surface"
    >
      <aside aria-label="Highlights" className="easy-button-rail easy-button-rail-left" />
      <main className="easy-button-stage">
        <button aria-label="Easy Button" className="easy-button-control" type="button">
          <Sparkles aria-hidden="true" className="easy-button-glyph" />
        </button>
      </main>
      <aside aria-label="Artifacts" className="easy-button-rail easy-button-rail-right" />
    </section>
  );
}
