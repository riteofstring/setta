import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin } from "@codemirror/view";
import { useKeywordRegex } from "state/definitions";
import { doesNotReferToSelf } from "./utils";

const italicStyle = Decoration.mark({ class: "italic" });

export function useKeywordStylizer({
  keywordPositions,
  sectionId,
  paramInfoId,
}) {
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
        const fullNameToInfo = useKeywordRegex.getState().fullNameToInfo;
        const text = view.state.doc;
        for (const kp of keywordPositions) {
          const keyword = text.sliceString(kp.startPos, kp.endPos);
          if (
            doesNotReferToSelf({
              fullNameToInfo,
              keyword,
              sectionId,
              paramInfoId,
            })
          ) {
            newKeywordLocations.push({
              startPos: kp.startPos,
              endPos: kp.endPos,
              keyword,
            });
            builder.add(kp.startPos, kp.endPos, italicStyle);
          }
        }
        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );

  return { keywordStylizer };
}
