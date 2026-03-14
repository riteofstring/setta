import { describe, expect, it } from "vitest";
import {
  getViewportTransformForCenter,
  getViewportTransformForCenteredZoom,
} from "./useViewportHelper";

describe("useViewportHelper", () => {
  it("centers a world point inside the visible workspace viewport", () => {
    // Centering must account for the overview rail offset, not just raw width / 2.
    expect(
      getViewportTransformForCenter({
        x: 480,
        y: 320,
        zoom: 1.5,
        width: 1200,
        height: 800,
        overviewTrueWidth: 280,
      }),
    ).toEqual({
      x: 160,
      y: -80,
      zoom: 1.5,
    });
  });

  it("preserves the current visible center when changing zoom", () => {
    // Shared zoom controls should keep the same world-space center on the engine path.
    expect(
      getViewportTransformForCenteredZoom({
        transform: {
          x: -200,
          y: -120,
          zoom: 1,
        },
        nextZoom: 2,
        width: 1000,
        height: 700,
        overviewTrueWidth: 260,
      }),
    ).toEqual({
      x: -1160,
      y: -590,
      zoom: 2,
    });
  });
});
