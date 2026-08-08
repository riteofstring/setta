import { describe, expect, it } from "vitest";

import {
  TransientRootProjection,
  type RootProjectionInput,
} from "../src/internal/transient-root-projection.js";

const roots: readonly RootProjectionInput[] = [
  {
    sectionId: "alpha",
    position: { x: 20, y: 30 },
    size: { width: 240, height: 180 },
  },
  {
    sectionId: "beta",
    position: { x: 400, y: 80 },
    size: { width: 200, height: 160 },
  },
];

describe("TransientRootProjection", () => {
  it("keeps high-frequency XYFlow position changes transient and emits one move command", () => {
    const documentRoots = structuredClone(roots);
    const projection = new TransientRootProjection(documentRoots, { x: 0, y: 0, zoom: 1 });

    projection.beginRootMove(["alpha"]);
    projection.applyRootChanges([
      { type: "position", sectionId: "alpha", position: { x: 25, y: 35 }, dragging: true },
    ]);
    projection.applyRootChanges([
      { type: "position", sectionId: "alpha", position: { x: 35, y: 55 }, dragging: true },
    ]);
    projection.applyRootChanges([
      { type: "position", sectionId: "alpha", position: { x: 50, y: 70 }, dragging: false },
    ]);

    expect(documentRoots).toEqual(roots);
    expect(projection.completeRootGesture()).toEqual({
      type: "move-root-sections",
      positions: { alpha: { x: 50, y: 70 } },
    });
    expect(projection.completeRootGesture()).toBeNull();
  });

  it("cancels a root movement without emitting a command or retaining its transient position", () => {
    const projection = new TransientRootProjection(roots, { x: 0, y: 0, zoom: 1 });

    projection.beginRootMove(["alpha", "beta"]);
    projection.applyRootChanges([
      { type: "position", sectionId: "alpha", position: { x: 50, y: 60 }, dragging: true },
      { type: "position", sectionId: "beta", position: { x: 430, y: 110 }, dragging: true },
    ]);
    projection.cancelRootGesture();

    expect(projection.roots()).toEqual([
      { ...roots[0], selected: false },
      { ...roots[1], selected: false },
    ]);
    expect(projection.completeRootGesture()).toBeNull();
  });

  it("separates measurement changes from a completed resize command", () => {
    const projection = new TransientRootProjection(roots, { x: 0, y: 0, zoom: 1 });

    projection.applyRootChanges([
      {
        type: "dimensions",
        sectionId: "alpha",
        size: { width: 242, height: 182 },
        resizing: false,
      },
    ]);
    expect(projection.completeRootGesture()).toBeNull();

    projection.beginRootResize("alpha");
    projection.applyRootChanges([
      {
        type: "dimensions",
        sectionId: "alpha",
        size: { width: 300, height: 210 },
        resizing: true,
      },
      {
        type: "dimensions",
        sectionId: "alpha",
        size: { width: 320, height: 220 },
        resizing: false,
      },
    ]);

    expect(projection.completeRootGesture()).toEqual({
      type: "resize-root-section",
      sectionId: "alpha",
      size: { width: 320, height: 220 },
    });
  });

  it("keeps upstream selection changes inside the transient projection", () => {
    const projection = new TransientRootProjection(roots, { x: 0, y: 0, zoom: 1 });

    projection.applyRootChanges([{ type: "selection", sectionId: "alpha", selected: true }]);

    expect(projection.roots()[0]?.selected).toBe(true);
    expect(projection.completeRootGesture()).toBeNull();
    projection.resetAcceptedProjection();
    expect(projection.roots()[0]?.selected).toBe(false);
  });

  it("coalesces viewport updates at completion and restores cancellation", () => {
    const projection = new TransientRootProjection(roots, { x: 10, y: 20, zoom: 1 });

    projection.beginViewportGesture();
    projection.updateViewport({ x: 12, y: 22, zoom: 1.2 });
    projection.updateViewport({ x: 18, y: 30, zoom: 1.5 });
    expect(projection.completeViewportGesture()).toEqual({
      type: "set-viewport",
      viewport: { x: 18, y: 30, zoom: 1.5 },
    });
    expect(projection.completeViewportGesture()).toBeNull();

    projection.beginViewportGesture();
    projection.updateViewport({ x: 100, y: 100, zoom: 2 });
    projection.cancelViewportGesture();
    expect(projection.viewport()).toEqual({ x: 18, y: 30, zoom: 1.5 });
  });

  it("fails specifically for unknown roots and overlapping gestures", () => {
    const projection = new TransientRootProjection(roots, { x: 0, y: 0, zoom: 1 });

    expect(() => projection.beginRootMove(["missing"])).toThrow(
      "Unknown root projection section missing",
    );
    projection.beginRootMove(["alpha"]);
    expect(() => projection.beginRootResize("beta")).toThrow("already active");
  });
});
