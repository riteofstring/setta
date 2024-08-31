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

      buildDecorations(view) {
        const builder = new RangeSetBuilder();
        const newKeywordLocations = [];
        const text = view.state.doc;
        for (const kp of keywordPositions) {
          const keyword = text.sliceString(kp.startPos, kp.endPos);
          newKeywordLocations.push({
            startPos: kp.startPos,
            endPos: kp.endPos,
            keyword,
          });
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
