import { describe, expect, it } from "vitest";
import {
  clientPointToWorkspacePosition,
  getKeyboardWorkspaceMenuPoint,
  placeWorkspaceMenu,
} from "./workspaceMenuGeometry.js";

describe("workspace menu geometry", () => {
  it.each([
    ["top leading", { x: 50, y: 45 }, { x: 50, y: 45 }],
    ["top trailing", { x: 1442, y: 45 }, { x: 1282, y: 45 }],
    ["bottom leading", { x: 50, y: 650 }, { x: 50, y: 371.6 }],
    ["bottom trailing", { x: 1442, y: 650 }, { x: 1282, y: 371.6 }],
  ])("matches the frozen %s edge placement", (_label, invocation, expected) => {
    const result = placeWorkspaceMenu({
      invocation,
      menuWidth: 160,
      menuHeight: 278.4,
      viewportWidth: 1492,
      viewportHeight: 696,
    });
    expect(result.x).toBeCloseTo(expected.x);
    expect(result.y).toBeCloseTo(expected.y);
  });

  it("clamps an oversized placement inside a compact viewport", () => {
    expect(
      placeWorkspaceMenu({
        invocation: { x: 319, y: 479 },
        menuWidth: 160,
        menuHeight: 300,
        viewportWidth: 320,
        viewportHeight: 480,
      }),
    ).toEqual({ x: 159, y: 179 });
  });

  it("anchors keyboard invocation on the logical leading side", () => {
    const rect = { left: 20, right: 220, top: 40, width: 200, height: 100 };
    expect(getKeyboardWorkspaceMenuPoint(rect, "ltr")).toEqual({
      x: 32,
      y: 64,
    });
    expect(getKeyboardWorkspaceMenuPoint(rect, "rtl")).toEqual({
      x: 208,
      y: 64,
    });
  });

  it("converts client coordinates through the actual canvas rectangle and viewport", () => {
    expect(
      clientPointToWorkspacePosition(
        { x: 500, y: 300 },
        { left: 100, top: 50 },
        { x: -200, y: 100, zoom: 2 },
      ),
    ).toEqual({ x: 300, y: 75 });
  });

  it("rejects invalid measured and viewport geometry", () => {
    expect(() =>
      placeWorkspaceMenu({
        invocation: { x: 0, y: 0 },
        menuWidth: 0,
        menuHeight: 10,
        viewportWidth: 100,
        viewportHeight: 100,
      }),
    ).toThrow(/measured size must be positive/);
    expect(() =>
      clientPointToWorkspacePosition(
        { x: 0, y: 0 },
        { left: 0, top: 0 },
        { x: 0, y: 0, zoom: 0 },
      ),
    ).toThrow(/non-positive viewport zoom/);
  });
});
