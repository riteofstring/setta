import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin } from "@codemirror/view";

const italicStyle = Decoration.mark({ class: "italic" });

export function useKeywordStylizer(keywordPositions) {
  const keywordStylizer = ViewPlugin.fromClass(
    class {
      decorations;

      constructor(view) {
        this.decorations = this.buildDecorations(view);
      }

      update(update) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations() {
        const builder = new RangeSetBuilder();
        for (const kp of keywordPositions) {
          builder.add(kp.startPos, kp.endPos, italicStyle);
        }
        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );

  return keywordStylizer;
}
