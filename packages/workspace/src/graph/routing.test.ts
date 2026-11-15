import { describe, expect, it } from "vitest";
import {
  getWorkspaceGraphRoute,
  type WorkspaceGraphEndpoint,
  type WorkspaceGraphObstacle,
} from "./routing.js";

const endpoint = (
  x: number,
  y: number,
  side: "left" | "right",
): WorkspaceGraphEndpoint => ({ point: { x, y }, side });

function expectClear(
  source: WorkspaceGraphEndpoint,
  target: WorkspaceGraphEndpoint,
  obstacles: WorkspaceGraphObstacle[],
) {
  const route = getWorkspaceGraphRoute(source, target, obstacles);
  expect(route.points[0]).toEqual(source.point);
  expect(route.points.at(-1)).toEqual(target.point);
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1]!;
    const b = route.points[i]!;
    expect(a.x === b.x || a.y === b.y).toBe(true);
    for (let t = 0; t <= 100; t++) {
      const x = a.x + ((b.x - a.x) * t) / 100;
      const y = a.y + ((b.y - a.y) * t) / 100;
      expect(
        obstacles.some(
          (rect) =>
            x > rect.left && x < rect.right && y > rect.top && y < rect.bottom,
        ),
      ).toBe(false);
    }
  }
  return route;
}

describe("automatic graph routing", () => {
  it("routes around an unrelated section between two ports", () => {
    const route = expectClear(
      endpoint(0, 100, "right"),
      endpoint(350, 100, "left"),
      [{ left: 100, top: 40, right: 240, bottom: 160 }],
    );
    expect(route.points.some((point) => point.y < 40 || point.y > 160)).toBe(
      true,
    );
    expect(route.path).toContain("Q");
    expect(Number.isFinite(route.labelX) && Number.isFinite(route.labelY)).toBe(
      true,
    );
  });

  it("uses a narrow gutter instead of crossing either section", () => {
    const route = expectClear(
      endpoint(0, 100, "right"),
      endpoint(400, 100, "left"),
      [
        { left: 70, top: -100, right: 330, bottom: 97 },
        { left: 70, top: 103, right: 330, bottom: 300 },
      ],
    );
    expect(route.points.every((point) => point.y === 100)).toBe(true);
  });

  it("approaches a backwards-facing target from its declared side", () => {
    const source = endpoint(100, 80, "right");
    const target = endpoint(320, 140, "right");
    const route = expectClear(source, target, [
      { left: 0, top: 0, right: 100, bottom: 200 },
      { left: 220, top: 0, right: 320, bottom: 200 },
    ]);
    expect(route.points.at(-2)!.x).toBeGreaterThan(target.point.x);
    expect(route.points[1]!.x).toBeGreaterThan(source.point.x);
  });

  it("takes a new clear path after a panel moves across a connection", () => {
    const source = endpoint(0, 0, "right");
    const target = endpoint(500, 120, "left");
    const first = expectClear(source, target, [
      { left: 150, top: -60, right: 330, bottom: 80 },
    ]);
    const second = expectClear(source, target, [
      { left: 150, top: 40, right: 330, bottom: 200 },
    ]);
    expect(second.points).not.toEqual(first.points);
  });

  it("keeps nested connections within available group gutters", () => {
    expectClear(endpoint(140, 90, "right"), endpoint(340, 240, "left"), [
      { left: 0, top: 0, right: 500, bottom: 28 },
      { left: 20, top: 50, right: 140, bottom: 160 },
      { left: 160, top: 50, right: 320, bottom: 300 },
      { left: 340, top: 50, right: 480, bottom: 300 },
    ]);
  });

  it("retains finite geometry when panels overlap at their ports", () => {
    const route = getWorkspaceGraphRoute(
      endpoint(100, 100, "right"),
      endpoint(100, 100, "left"),
      [{ left: 0, top: 0, right: 200, bottom: 200 }],
    );
    expect(
      route.points
        .flatMap((point) => [point.x, point.y])
        .every(Number.isFinite),
    ).toBe(true);
    expect(route.path).not.toMatch(/NaN|Infinity/);
  });
});
