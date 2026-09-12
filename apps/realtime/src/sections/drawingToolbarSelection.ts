import type {
  DrawingSelectionAppearancePatch,
  DrawingSelectionSnapshot,
  DrawingTool,
} from "./drawingRuntime";

export type DrawingSelectionPaint = {
  color: string;
  label: "Color" | "Fill" | "Stroke";
  target: "fill" | "stroke";
};

const DRAWING_HEX_COLOR = /^#[0-9a-f]{6}$/i;
const DRAWING_STROKE_COLOR_KINDS = new Set<DrawingSelectionSnapshot["kind"]>([
  "arrow",
  "line",
  "stroke",
]);

function drawingSelectionColor(
  enabled: DrawingSelectionSnapshot["fillEnabled"],
  color: DrawingSelectionSnapshot["fillColor"],
): string | null {
  if (enabled !== true || typeof color !== "string") {
    return null;
  }
  return DRAWING_HEX_COLOR.test(color) ? color : null;
}

function drawingSelectionPaints(
  selection: DrawingSelectionSnapshot,
): DrawingSelectionPaint[] {
  const paints: DrawingSelectionPaint[] = [];
  const fillColor = drawingSelectionColor(
    selection.fillEnabled,
    selection.fillColor,
  );
  const strokeColor = drawingSelectionColor(
    selection.strokeEnabled,
    selection.strokeColor,
  );
  if (fillColor !== null) {
    paints.push({
      color: fillColor,
      label: selection.kind === "text" ? "Color" : "Fill",
      target: "fill",
    });
  }
  if (strokeColor !== null) {
    paints.push({
      color: strokeColor,
      label: DRAWING_STROKE_COLOR_KINDS.has(selection.kind)
        ? "Color"
        : "Stroke",
      target: "stroke",
    });
  }
  return paints;
}

export function drawingSelectionPaintLabel(
  selection: DrawingSelectionSnapshot,
  paint: DrawingSelectionPaint,
): string {
  const selectionLabel = selection.count === 1 ? selection.kind : "objects";
  return paint.label === "Color"
    ? `Selected ${selectionLabel} color`
    : `Selected ${selectionLabel} ${paint.label.toLowerCase()} color`;
}

export function drawingSelectionColorPatch(
  target: DrawingSelectionPaint["target"],
  color: string,
): DrawingSelectionAppearancePatch {
  return target === "fill" ? { fill: color } : { stroke: color };
}

export function drawingToolbarSelectionPaints(
  tool: DrawingTool,
  selection: DrawingSelectionSnapshot,
): DrawingSelectionPaint[] {
  return tool === "select" ? drawingSelectionPaints(selection) : [];
}
