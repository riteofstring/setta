import { describe, expect, it } from "vitest";
import {
  applyViewModesTabsPanelResize,
  clampViewModesTabsPanelHeight,
} from "./ViewingEditingMode";

describe("ViewingEditingMode tab preview sizing helpers", () => {
  it("clamps to the minimum height when requested size is too small", () => {
    // Prevents collapsing the panel below the readable chip area.
    const height = clampViewModesTabsPanelHeight({
      requestedHeight: 12,
      containerHeight: 420,
    });
    expect(height).toBe(88);
  });

  it("clamps to the computed maximum height based on container space", () => {
    // Keeps enough vertical space for the top view-modes list.
    const height = clampViewModesTabsPanelHeight({
      requestedHeight: 999,
      containerHeight: 320,
    });
    expect(height).toBe(140);
  });

  it("applies drag delta and keeps the result inside legal bounds", () => {
    // Dragging up grows the bottom panel; dragging down shrinks it.
    const grown = applyViewModesTabsPanelResize({
      startHeight: 132,
      deltaY: 48,
      containerHeight: 500,
    });
    expect(grown).toBe(180);

    const shrunk = applyViewModesTabsPanelResize({
      startHeight: 132,
      deltaY: -400,
      containerHeight: 500,
    });
    expect(shrunk).toBe(88);
  });
});
