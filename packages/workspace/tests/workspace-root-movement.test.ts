import { describe, expect, it } from "vitest";

import { moveWorkspaceRootWithKeyboard } from "../src/internal/workspace-root-movement.js";

describe("workspace root keyboard movement", () => {
  it("moves to the next grid line from aligned and unaligned coordinates", () => {
    const grid = { snap: true, spacing: [24, 16] as const };

    expect(moveWorkspaceRootWithKeyboard({ x: 80, y: -17 }, "right", grid)).toEqual({
      x: 96,
      y: -17,
    });
    expect(moveWorkspaceRootWithKeyboard({ x: 80, y: -17 }, "left", grid)).toEqual({
      x: 72,
      y: -17,
    });
    expect(moveWorkspaceRootWithKeyboard({ x: 48, y: -17 }, "down", grid)).toEqual({
      x: 48,
      y: -16,
    });
    expect(moveWorkspaceRootWithKeyboard({ x: 48, y: -17 }, "up", grid)).toEqual({
      x: 48,
      y: -32,
    });
  });

  it("uses ten workbench units per arrow press when snapping is off", () => {
    const grid = { snap: false, spacing: [24, 16] as const };

    expect(moveWorkspaceRootWithKeyboard({ x: -5, y: 8 }, "right", grid)).toEqual({
      x: 5,
      y: 8,
    });
    expect(moveWorkspaceRootWithKeyboard({ x: -5, y: 8 }, "up", grid)).toEqual({
      x: -5,
      y: -2,
    });
  });
});
