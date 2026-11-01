import { describe, expect, it } from "vitest";
import {
  getWorkspaceGraphBezier,
  getWorkspaceGraphClientPoint,
  getWorkspaceGraphElementCenter,
  getWorkspaceGraphViewportPoint,
} from "./geometry.js";

describe("Workspace graph geometry", () => {
  it("maps client and viewport coordinates through pan and zoom", () => {
    const rootRect = { left: 120, top: 80 } as DOMRect;
    const transform = [40, -20, 2] as const;
    const viewportPoint = getWorkspaceGraphViewportPoint(
      { x: 280, y: 220 },
      rootRect,
      transform,
    );
    expect(viewportPoint).toEqual({ x: 60, y: 80 });
    expect(
      getWorkspaceGraphClientPoint(viewportPoint, rootRect, transform),
    ).toEqual({ x: 280, y: 220 });
  });

  it("uses measured element centers for root and nested port alignment", () => {
    const rootRect = { left: 100, top: 50 } as DOMRect;
    const transform = [20, 30, 2] as const;
    const rootPort = getWorkspaceGraphElementCenter({
      height: 10,
      left: 200,
      top: 150,
      width: 10,
    } as DOMRect);
    const nestedPort = getWorkspaceGraphElementCenter({
      height: 10,
      left: 500,
      top: 330,
      width: 10,
    } as DOMRect);
    expect(
      getWorkspaceGraphViewportPoint(rootPort, rootRect, transform),
    ).toEqual({ x: 42.5, y: 37.5 });
    expect(
      getWorkspaceGraphViewportPoint(nestedPort, rootRect, transform),
    ).toEqual({ x: 192.5, y: 127.5 });
  });

  it("builds a side-aware bezier path for edge and connection previews", () => {
    const bezier = getWorkspaceGraphBezier(
      { x: 40, y: 30 },
      "right",
      { x: 180, y: 90 },
      "left",
    );
    expect(bezier.path).toContain("M40,30");
    expect(bezier.path).toContain("180,90");
    expect(bezier.labelX).toBeGreaterThan(40);
    expect(bezier.labelX).toBeLessThan(180);
    expect(bezier.labelY).toBeGreaterThan(30);
    expect(bezier.labelY).toBeLessThan(90);
  });
});
