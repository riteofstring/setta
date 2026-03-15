import { describe, expect, it } from "vitest";

import {
  resolveDefaultDockedChatHeightPx,
  resolveDefaultFloatingChatBounds,
} from "./projectChatWindowingDefaultBounds";

describe("projectChatWindowingDefaultBounds", () => {
  it("resolves default docked chat height from the viewport height", () => {
    // Default docked windows should take seventy percent of the viewport, clamped to the dock space.
    expect(
      resolveDefaultDockedChatHeightPx({
        viewportHeightPx: 900,
        workspaceTopInsetPx: 40,
        bottomInsetPx: 36,
      }),
    ).toBe(630);
  });

  it("resolves default floating chat bounds in the center at seventy percent viewport height", () => {
    // Explicit floating windows should open centered within the floating work area.
    const bounds = resolveDefaultFloatingChatBounds({
      viewportWidthPx: 1440,
      viewportHeightPx: 900,
      workspaceTopInsetPx: 40,
      bottomInsetPx: 0,
    });

    expect(bounds).toEqual({
      x: 310,
      y: 155,
      width: 820,
      height: 630,
    });
  });
});
