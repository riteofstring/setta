import { describe, expect, it } from "vitest";

import {
  createInteractionRect,
  normalizeScreenDelta,
  resolveCanvasDropPositions,
  resolveRectBoundsById,
  screenPointToWorkspace,
  serializeDragTransform,
  workspacePointToScreen,
} from "../src/testing.js";
import {
  FIXTURE_ATTRIBUTION,
  INTERACTION_FIXTURE_EVIDENCE,
  SOURCE_SNAPSHOT,
} from "./fixtures/interaction-evidence.js";

describe("Phase 0 scaled-geometry characterization", () => {
  it("ties the executable fixture to the recorded source behavior", () => {
    expect(SOURCE_SNAPSHOT).toHaveLength(40);
    expect(INTERACTION_FIXTURE_EVIDENCE.geometry.sources).toContain(
      "frontend/src/forks/dnd-kit/adapter/zoom.ts",
    );
    expect(FIXTURE_ATTRIBUTION).toContain("closely port historical MIT-licensed algorithms");
    expect(FIXTURE_ATTRIBUTION).toContain("THIRD_PARTY_NOTICES.md");
  });

  it.each([
    { expected: { x: 80, y: -40 }, zoom: 0.25 },
    { expected: { x: 20, y: -10 }, zoom: 1 },
    { expected: { x: 5, y: -2.5 }, zoom: 4 },
  ])("normalizes screen deltas at zoom $zoom", ({ expected, zoom }) => {
    expect(normalizeScreenDelta({ x: 20, y: -10 }, zoom)).toEqual(expected);
  });

  it("round-trips negative workspace coordinates through a transformed viewport", () => {
    const viewport = { x: 120, y: -40, zoom: 2 };
    const workspacePoint = { x: -35, y: 75 };

    const screenPoint = workspacePointToScreen(workspacePoint, viewport);

    expect(screenPoint).toEqual({ x: 50, y: 110 });
    expect(screenPointToWorkspace(screenPoint, viewport)).toEqual(workspacePoint);
  });

  it("rejects invalid zoom instead of creating corrupt geometry", () => {
    expect(() => normalizeScreenDelta({ x: 1, y: 1 }, 0)).toThrow(
      "Viewport zoom must be a positive finite number.",
    );
    expect(() => screenPointToWorkspace({ x: 1, y: 1 }, { x: 0, y: 0, zoom: Number.NaN })).toThrow(
      "Viewport zoom must be a positive finite number.",
    );
  });

  it("combines all selected rectangles into one collision and overlay shape", () => {
    const rects = {
      ancestor: createInteractionRect(10, 20, 30, 40),
      sibling: createInteractionRect(-5, 15, 30, 30),
    };

    expect(resolveRectBoundsById(["ancestor", "sibling"], rects)).toEqual(
      createInteractionRect(-5, 15, 45, 45),
    );
    expect(resolveRectBoundsById(["ancestor", "missing"], rects)).toBeNull();
    expect(resolveRectBoundsById([], rects)).toBeNull();
  });

  it("preserves selection offsets when resolving a zoomed canvas drop", () => {
    expect(
      resolveCanvasDropPositions(
        ["a", "b"],
        {
          a: createInteractionRect(100, 80, 20, 20),
          b: createInteractionRect(140, 100, 20, 20),
        },
        { x: 20, y: -10 },
        { x: 40, y: 20, zoom: 2 },
      ),
    ).toEqual({
      a: { x: 40, y: 25 },
      b: { x: 60, y: 35 },
    });
  });

  it("serializes translated and scaled drag previews deterministically", () => {
    expect(serializeDragTransform({ x: 4, y: 6, scaleX: 1, scaleY: 1 })).toBe(
      "translate3d(4px, 6px, 0)",
    );
    expect(serializeDragTransform({ x: 4, y: 6, scaleX: 1.2, scaleY: 0.8 })).toBe(
      "translate3d(4px, 6px, 0) scaleX(1.2) scaleY(0.8)",
    );
  });
});
