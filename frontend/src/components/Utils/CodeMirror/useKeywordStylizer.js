import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin } from "@codemirror/view";
import { useRef } from "react";
import { useKeywordRegex } from "state/definitions";
import { doesNotReferToSelf } from "./utils";

const italicStyle = Decoration.mark({ class: "italic" });

export function useKeywordStylizer({ pattern, sectionId, paramInfoId }) {
  const keywordLocations = useRef([]);

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
        for (const { from, to } of view.visibleRanges) {
          const text = view.state.doc.sliceString(from, to);
          let match;
          while ((match = pattern.exec(text))) {
            const startPos = from + match.index;
            const endPos = startPos + match[0].length;
            const keyword = match[0];
            if (
              doesNotReferToSelf({
                fullNameToInfo,
                keyword,
                sectionId,
                paramInfoId,
              })
            ) {
              newKeywordLocations.push({ startPos, endPos, keyword });
              builder.add(startPos, endPos, italicStyle);
            }
          }
        }
        keywordLocations.current = newKeywordLocations;
        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );

  return { keywordLocations, keywordStylizer };
}
