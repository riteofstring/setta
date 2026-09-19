import { describe, expect, it } from "vitest";

import {
  annotationPath,
  normalizeAnnotationPoint,
  settleAnnotationStroke,
} from "./artifactAnnotationModel";

describe("artifact annotation model", () => {
  const bounds = {
    height: 100,
    left: 10,
    top: 20,
    width: 200,
  };

  it("normalizes client coordinates and clamps them to the artifact", () => {
    expect(normalizeAnnotationPoint(110, 70, bounds)).toEqual({
      x: 0.5,
      y: 0.5,
    });
    expect(normalizeAnnotationPoint(-10, 140, bounds)).toEqual({
      x: 0,
      y: 1,
    });
  });

  it("rejects coordinates that cannot be normalized", () => {
    expect(
      normalizeAnnotationPoint(20, 30, { ...bounds, width: 0 }),
    ).toBeNull();
    expect(normalizeAnnotationPoint(Number.NaN, 30, bounds)).toBeNull();
  });

  it("keeps only distinct consecutive points and requires a real stroke", () => {
    const start = { x: 0.25, y: 0.5 };
    const end = { x: 0.75, y: 0.5 };

    expect(settleAnnotationStroke([start, { ...start }])).toBeNull();
    expect(settleAnnotationStroke([start, { ...start }, end])).toEqual([
      start,
      end,
    ]);
  });

  it("projects normalized points into an SVG path", () => {
    expect(
      annotationPath([
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.8 },
      ]),
    ).toBe("M 0.1 0.2 L 0.5 0.8");
  });
});
