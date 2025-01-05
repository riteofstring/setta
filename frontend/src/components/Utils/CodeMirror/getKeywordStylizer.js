import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin } from "@codemirror/view";

const italicStyle = Decoration.mark({ class: "italic" });

export function getKeywordStylizer(evRefs) {
  const keywordStylizer = ViewPlugin.fromClass(
    class {
      decorations;
      positions;

      constructor() {
        this.positions = [...evRefs];
        this.decorations = this.buildDecorations();
      }

      update(update) {
        if (update.docChanged) {
          update.changes.iterChanges((fromA, toA, fromB, toB) => {
            const delta = toB - fromB - (toA - fromA);
            this.positions = this.positions.map((pos) => {
              if (pos.startPos > fromA) {
                return {
                  ...pos,
                  startPos: pos.startPos + delta,
                };
              }
              return pos;
            });
          });

          this.decorations = this.buildDecorations();
        }
      }

      buildDecorations() {
        const builder = new RangeSetBuilder();
        for (const pos of this.positions) {
          builder.add(
            pos.startPos,
            pos.startPos + pos.keyword.length,
            italicStyle,
          );
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
