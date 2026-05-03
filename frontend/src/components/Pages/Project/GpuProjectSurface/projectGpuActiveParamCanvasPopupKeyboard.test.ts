// @vitest-environment jsdom

import { createGpuRetainedRowContentScene } from "gpuFlow/retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "gpuFlow/scene";
import { describe, expect, it } from "vitest";
import { resolveProjectGpuActiveParamCanvasPopupKeyboard } from "./projectGpuActiveParamCanvasPopupKeyboard";

describe("project GPU active param canvas popup keyboard", () => {
  it("updates active dropdown popup highlight without mounting a DOM island", () => {
    const result = resolveProjectGpuActiveParamCanvasPopupKeyboard({
      activeParamCanvasPopup: {
        hitRecordId: "control:dropdown-param",
        kind: "dropdown",
        paramInfoId: "dropdown-param",
        sectionId: "section-a",
        surfaceId: "surface-a",
      },
      event: { key: "ArrowDown" },
      scene: retainedContentScene(),
    });

    expect(result).toEqual({
      action: "highlight",
      handled: true,
      popup: {
        highlightedOptionIndex: 2,
        hitRecordId: "control:dropdown-param",
        kind: "dropdown",
        paramInfoId: "dropdown-param",
        sectionId: "section-a",
        surfaceId: "surface-a",
      },
    });
  });

  it("resolves Enter to the highlighted configured color choice value", () => {
    const result = resolveProjectGpuActiveParamCanvasPopupKeyboard({
      activeParamCanvasPopup: {
        highlightedOptionIndex: 1,
        hitRecordId: "control:color-param",
        kind: "color-picker",
        paramInfoId: "color-param",
        sectionId: "section-a",
        surfaceId: "surface-a",
      },
      event: { key: "Enter" },
      scene: retainedContentScene(),
    });

    expect(result).toEqual({
      action: "commit",
      handled: true,
      optionValue: "#22c55e",
      popup: {
        highlightedOptionIndex: 1,
        hitRecordId: "control:color-param",
        kind: "color-picker",
        paramInfoId: "color-param",
        sectionId: "section-a",
        surfaceId: "surface-a",
      },
    });
  });
});

function retainedContentScene(): GpuFlowScene {
  return {
    contentSurfaces: [retainedSurface()],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedSurface(): GpuContentSurface {
  const rect = { height: 120, width: 260, x: 0, y: 0 };
  return {
    clipRect: rect,
    id: "surface-a",
    ownerSectionId: "section-a",
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: "surface-a",
    },
    retainedScene: createGpuRetainedRowContentScene({
      id: "surface-a",
      ownerSectionId: "section-a",
      rowHeight: 28,
      rows: [
        {
          control: {
            choices: [
              { label: "Alpha", value: "alpha" },
              { label: "Beta", value: "beta" },
              { label: "Gamma", value: "gamma" },
            ],
            defaultDisplayValue: "alpha",
            displayValue: "beta",
            kind: "dropdown",
            rendererFamily: "dropdown",
            commitPolicy: "immediate",
            selectedIndex: 1,
          },
          controlKind: "dropdown",
          depth: 0,
          id: "dropdown-param",
          label: "Dropdown",
        },
        {
          control: {
            choices: [
              { color: "#ef4444", description: "Red" },
              { color: "#22c55e", description: "Green" },
            ],
            defaultDisplayValue: "#ef4444",
            displayValue: "#ef4444",
            kind: "color-picker",
            rendererFamily: "color-picker",
            commitPolicy: "immediate",
            selectedIndex: 0,
          },
          controlKind: "color-picker",
          depth: 0,
          id: "color-param",
          label: "Color",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: rect.height, width: rect.width, x: 0, y: 0 },
    }),
    zIndex: 1,
  };
}
