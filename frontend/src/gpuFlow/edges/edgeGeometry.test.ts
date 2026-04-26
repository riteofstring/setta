import { describe, expect, it } from "vitest";
import {
  buildGpuEdgeGeometry,
  getDistanceToGpuEdgeGeometry,
  getGpuBezierEdgeGeometry,
  getGpuStraightEdgeGeometry,
  hitTestGpuEdges,
  normalizeGpuEdgeSide,
  resolveGpuEdgeKind,
  sampleGpuEdgeGeometry,
} from "./edgeGeometry";

describe("GPU edge geometry", () => {
  it("builds straight edge geometry with midpoint label and bounds", () => {
    expect(
      getGpuStraightEdgeGeometry({
        edgeId: "edge-a",
        source: { x: 10, y: 20 },
        target: { x: 50, y: 80 },
      }),
    ).toEqual({
      bounds: { height: 60, width: 40, x: 10, y: 20 },
      edgeId: "edge-a",
      kind: "straight",
      label: { offsetX: 20, offsetY: 30, x: 30, y: 50 },
      source: { x: 10, y: 20 },
      target: { x: 50, y: 80 },
    });
  });

  it("builds bezier controls from handle sides using the existing Setta curve policy", () => {
    const geometry = getGpuBezierEdgeGeometry({
      edgeId: "edge-a",
      source: { x: 0, y: 0 },
      sourceSide: "right",
      target: { x: 100, y: 0 },
      targetSide: "left",
    });

    expect(geometry).toMatchObject({
      bounds: { height: 0, width: 100, x: 0, y: 0 },
      edgeId: "edge-a",
      kind: "bezier",
      label: { offsetX: 50, offsetY: 0, x: 50, y: 0 },
      sourceControl: { x: 50, y: 0 },
      sourceSide: "right",
      targetControl: { x: 50, y: 0 },
      targetSide: "left",
    });
  });

  it("keeps bezier bounds around the actual curve, not just endpoints", () => {
    const geometry = getGpuBezierEdgeGeometry({
      edgeId: "edge-back",
      source: { x: 100, y: 0 },
      sourceSide: "right",
      target: { x: 0, y: 0 },
      targetSide: "left",
    });

    expect(geometry.sourceControl.x).toBeCloseTo(162.5);
    expect(geometry.targetControl.x).toBeCloseTo(-62.5);
    expect(geometry.bounds.x).toBeLessThan(0);
    expect(geometry.bounds.x + geometry.bounds.width).toBeGreaterThan(100);
  });

  it("samples bezier geometry into deterministic points for buffers and hit testing", () => {
    const geometry = getGpuBezierEdgeGeometry({
      edgeId: "edge-a",
      source: { x: 0, y: 0 },
      sourceSide: "bottom",
      target: { x: 100, y: 100 },
      targetSide: "top",
    });

    expect(sampleGpuEdgeGeometry(geometry, { bezierSegments: 2 })).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 100 },
    ]);
  });

  it("hit-tests the closest selectable edge in flow coordinates", () => {
    const lower = buildGpuEdgeGeometry({
      edgeId: "lower",
      source: { x: 0, y: 0 },
      target: { x: 100, y: 0 },
      type: "straight",
    });
    const upper = buildGpuEdgeGeometry({
      edgeId: "upper",
      source: { x: 0, y: 0 },
      target: { x: 100, y: 0 },
      type: "straight",
    });

    expect(
      getDistanceToGpuEdgeGeometry({
        geometry: lower,
        point: { x: 25, y: 4 },
      }),
    ).toBe(4);
    expect(
      hitTestGpuEdges({
        edges: [
          { edgeId: "lower", geometry: lower, zIndex: 1 },
          { edgeId: "upper", geometry: upper, zIndex: 2 },
        ],
        point: { x: 25, y: 4 },
        tolerance: 5,
      }),
    ).toEqual({ distance: 4, edgeId: "upper", zIndex: 2 });
    expect(
      hitTestGpuEdges({
        edges: [
          { edgeId: "lower", geometry: lower, selectable: false, zIndex: 1 },
        ],
        point: { x: 25, y: 4 },
        tolerance: 5,
      }),
    ).toBeNull();
  });

  it("fails loudly for unsupported edge types and handle sides", () => {
    expect(() => resolveGpuEdgeKind("smoothstep")).toThrow(
      'Unsupported GPU edge type "smoothstep".',
    );
    expect(() => normalizeGpuEdgeSide("middle", "bottom")).toThrow(
      'Unsupported GPU edge side "middle".',
    );
  });
});
