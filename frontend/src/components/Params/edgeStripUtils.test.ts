import { describe, expect, it } from "vitest";
import {
  resolveEdgeStripHeight,
  resolveEdgeStripOutputPortAnchorLocalPosition,
} from "./edgeStripUtils";

describe("resolveEdgeStripHeight", () => {
  it("returns 0 when there are no ports and no measured height", () => {
    expect(
      resolveEdgeStripHeight({
        measuredHeight: null,
        inputPortCount: 0,
        outputPortCount: 0,
      }),
    ).toBe(0);
  });

  it("uses the larger input or output port count when estimating height", () => {
    expect(
      resolveEdgeStripHeight({
        measuredHeight: undefined,
        inputPortCount: 1,
        outputPortCount: 3,
      }),
    ).toBe(128);
  });

  it("accounts for row gaps when multiple rows exist", () => {
    expect(
      resolveEdgeStripHeight({
        measuredHeight: undefined,
        inputPortCount: 0,
        outputPortCount: 2,
      }),
    ).toBe(100);
  });

  it("prefers measured height when available", () => {
    expect(
      resolveEdgeStripHeight({
        measuredHeight: 131.2,
        inputPortCount: 2,
        outputPortCount: 3,
      }),
    ).toBe(132);
  });

  it("derives output port anchor positions from the shared strip row layout", () => {
    expect(
      resolveEdgeStripOutputPortAnchorLocalPosition({
        portIndex: 2,
        sectionWidth: 120,
        stripLocalY: 16,
      }),
    ).toEqual({ x: 121, y: 132 });
  });
});
