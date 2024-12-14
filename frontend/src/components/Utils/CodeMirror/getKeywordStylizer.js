import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin } from "@codemirror/view";

const italicStyle = Decoration.mark({ class: "italic" });

export function getKeywordStylizer(evRefs) {
  const keywordStylizer = ViewPlugin.fromClass(
    class {
      decorations;

      constructor() {
        this.originalDecorations = this.buildDecorations();
        this.decorations = this.originalDecorations;
      }

      update(update) {
        if (update.docChanged) {
          this.decorations = this.originalDecorations.update({
            filter: (from) => from < update.view.state.doc.length,
          });
        }
      }

      buildDecorations() {
        const builder = new RangeSetBuilder();
        for (const kp of evRefs) {
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
