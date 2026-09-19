import { describe, expect, it } from "vitest";

import {
  annotationPath,
  containedImageBounds,
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

  it("normalizes coordinates inside the artifact and rejects its margins", () => {
    expect(normalizeAnnotationPoint(110, 70, bounds)).toEqual({
      x: 0.5,
      y: 0.5,
    });
    expect(normalizeAnnotationPoint(10, 20, bounds)).toEqual({ x: 0, y: 0 });
    expect(normalizeAnnotationPoint(210, 120, bounds)).toEqual({
      x: 1,
      y: 1,
    });
    expect(normalizeAnnotationPoint(9, 70, bounds)).toBeNull();
    expect(normalizeAnnotationPoint(110, 121, bounds)).toBeNull();
  });

  it("fits the annotation bounds to contained image pixels", () => {
    expect(containedImageBounds(bounds, 1_600, 800)).toEqual({
      height: 100,
      left: 10,
      top: 20,
      width: 200,
    });
    expect(containedImageBounds(bounds, 100, 100)).toEqual({
      height: 100,
      left: 60,
      top: 20,
      width: 100,
    });
    expect(containedImageBounds(bounds, 0, 100)).toBeNull();
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
