import { describe, expect, it } from "vitest";

import type { DrawingSelectionSnapshot } from "./drawingRuntime";
import { EMPTY_DRAWING_SELECTION_SNAPSHOT } from "./drawingSurfaceRegistry";
import {
  drawingSelectionPaintLabel,
  drawingToolbarSelectionPaints,
} from "./drawingToolbarSelection";

function selectionSnapshot(
  patch: Partial<DrawingSelectionSnapshot>,
): DrawingSelectionSnapshot {
  return { ...EMPTY_DRAWING_SELECTION_SNAPSHOT, ...patch };
}

describe("drawing toolbar selection colors", () => {
  it("presents the concrete paints supported by selected objects", () => {
    const rectangle = selectionSnapshot({
      count: 1,
      fillColor: "#e5ecfd",
      fillEnabled: true,
      kind: "rectangle",
      strokeColor: "#2563eb",
      strokeEnabled: true,
      supportsFill: true,
      supportsStroke: true,
    });
    expect(drawingToolbarSelectionPaints("select", rectangle)).toEqual([
      { color: "#e5ecfd", label: "Fill", target: "fill" },
      { color: "#2563eb", label: "Stroke", target: "stroke" },
    ]);

    const text = selectionSnapshot({
      count: 1,
      fillColor: "#111827",
      fillEnabled: true,
      kind: "text",
      supportsFill: true,
    });
    expect(drawingToolbarSelectionPaints("select", text)).toEqual([
      { color: "#111827", label: "Color", target: "fill" },
    ]);

    const line = selectionSnapshot({
      count: 1,
      kind: "line",
      strokeColor: "#047857",
      strokeEnabled: true,
      supportsStroke: true,
    });
    expect(drawingToolbarSelectionPaints("select", line)).toEqual([
      { color: "#047857", label: "Color", target: "stroke" },
    ]);
    expect(drawingToolbarSelectionPaints("rectangle", rectangle)).toEqual([]);
  });

  it("leaves mixed, disabled, and non-hex paints to the Inspector", () => {
    const mixed = selectionSnapshot({
      count: 1,
      fillColor: "mixed",
      fillEnabled: true,
      kind: "rectangle",
      supportsFill: true,
    });
    const disabled = selectionSnapshot({
      count: 1,
      fillColor: "#e5ecfd",
      fillEnabled: false,
      kind: "rectangle",
      supportsFill: true,
    });
    const nonHex = selectionSnapshot({
      count: 1,
      kind: "stroke",
      strokeColor: "rgba(17,24,39,0.5)",
      strokeEnabled: true,
      supportsStroke: true,
    });
    expect(drawingToolbarSelectionPaints("select", mixed)).toEqual([]);
    expect(drawingToolbarSelectionPaints("select", disabled)).toEqual([]);
    expect(drawingToolbarSelectionPaints("select", nonHex)).toEqual([]);
  });

  it("describes the selected object and paint in its accessible label", () => {
    const rectangle = selectionSnapshot({ count: 1, kind: "rectangle" });
    const fill = { color: "#e5ecfd", label: "Fill", target: "fill" } as const;
    expect(drawingSelectionPaintLabel(rectangle, fill)).toBe(
      "Selected rectangle fill color",
    );
  });
});
