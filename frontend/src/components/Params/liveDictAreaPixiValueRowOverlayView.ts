import type { CSSProperties } from "react";
import type { LiveDictAreaPixiValueRowTarget } from "./liveDictAreaPixiValueRowTargets";
import type { ParamEditorKind } from "./paramEditorActivation";

type BuildLiveDictAreaPixiValueRowOverlayStyleArgs = {
  editorKind: ParamEditorKind;
  target: Pick<LiveDictAreaPixiValueRowTarget, "height" | "width" | "x" | "y">;
  viewportZoom: number;
};

export function buildLiveDictAreaPixiValueRowOverlayStyle({
  editorKind,
  target,
  viewportZoom,
}: BuildLiveDictAreaPixiValueRowOverlayStyleArgs): CSSProperties {
  const baseStyle: CSSProperties = {
    contain: "layout paint",
    left: target.x,
    minHeight: target.height,
    top: target.y,
    width: target.width,
  };

  if (editorKind !== "codemirror" || viewportZoom >= 1 || viewportZoom <= 0) {
    return baseStyle;
  }

  return {
    ...baseStyle,
    transform: `scale(${1 / viewportZoom})`,
    transformOrigin: "top left",
  };
}
