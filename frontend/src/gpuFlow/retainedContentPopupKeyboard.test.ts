import { describe, expect, it } from "vitest";
import {
  getGpuRetainedContentChoicePopupKeyboardCommand,
  resolveGpuRetainedContentChoicePopupKeyboard,
} from "./retainedContentPopupKeyboard";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "./scene";

describe("retained content choice popup keyboard", () => {
  it("moves the highlighted dropdown option from retained choice metadata", () => {
    const result = resolveGpuRetainedContentChoicePopupKeyboard({
      command: { direction: 1, kind: "move" },
      scene: retainedContentScene(),
      target: {
        kind: "dropdown",
        ownerRowId: "dropdown-param",
        surfaceId: "surface-a",
      },
    });

    expect(result).toEqual({
      action: "highlight",
      handled: true,
      target: {
        highlightedOptionIndex: 2,
        kind: "dropdown",
        ownerRowId: "dropdown-param",
        surfaceId: "surface-a",
      },
    });
  });

  it("commits the highlighted configured color choice", () => {
    const result = resolveGpuRetainedContentChoicePopupKeyboard({
      command: { kind: "commit" },
      scene: retainedContentScene(),
      target: {
        highlightedOptionIndex: 1,
        kind: "color-picker",
        ownerRowId: "color-param",
        surfaceId: "surface-a",
      },
    });

    expect(result).toEqual({
      action: "commit",
      handled: true,
      option: { color: "#22c55e", description: "Green" },
      optionIndex: 1,
      optionValue: "#22c55e",
      target: {
        highlightedOptionIndex: 1,
        kind: "color-picker",
        ownerRowId: "color-param",
        surfaceId: "surface-a",
      },
    });
  });

  it("uses simple typeahead without a DOM input", () => {
    const result = resolveGpuRetainedContentChoicePopupKeyboard({
      command: { kind: "typeahead", query: "ga" },
      scene: retainedContentScene(),
      target: {
        highlightedOptionIndex: 0,
        kind: "dropdown",
        ownerRowId: "dropdown-param",
        surfaceId: "surface-a",
      },
    });

    expect(result).toEqual({
      action: "highlight",
      handled: true,
      target: {
        highlightedOptionIndex: 2,
        kind: "dropdown",
        ownerRowId: "dropdown-param",
        surfaceId: "surface-a",
      },
    });
  });

  it("maps keyboard events to retained popup commands", () => {
    expect(
      getGpuRetainedContentChoicePopupKeyboardCommand({ key: "ArrowUp" }),
    ).toEqual({ direction: -1, kind: "move" });
    expect(
      getGpuRetainedContentChoicePopupKeyboardCommand({ key: "Enter" }),
    ).toEqual({ kind: "commit" });
    expect(
      getGpuRetainedContentChoicePopupKeyboardCommand({ key: "g" }, "g"),
    ).toEqual({ kind: "typeahead", query: "g" });
    expect(
      getGpuRetainedContentChoicePopupKeyboardCommand({ key: "Tab" }),
    ).toBeNull();
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
