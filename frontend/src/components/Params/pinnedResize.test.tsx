import { describe, expect, it } from "vitest";
import { getPinnedResizeHeight } from "./pinnedResize";

describe("getPinnedResizeHeight", () => {
  it("returns null when resize never moved", () => {
    const nextHeight = getPinnedResizeHeight({
      didResize: false,
      delta: { height: 12, width: 0 },
      startHeight: 120,
      styleHeight: 140,
      minHeight: 80,
    });

    expect(nextHeight).toBeNull();
  });

  it("returns null when delta is zero", () => {
    const nextHeight = getPinnedResizeHeight({
      didResize: true,
      delta: { height: 0, width: 0 },
      startHeight: 120,
      styleHeight: 140,
      minHeight: 80,
    });

    expect(nextHeight).toBeNull();
  });

  it("uses a valid style height when start height is missing", () => {
    const nextHeight = getPinnedResizeHeight({
      didResize: true,
      delta: { height: 20, width: 0 },
      startHeight: null,
      styleHeight: 160,
      minHeight: 80,
    });

    expect(nextHeight).toBe(160);
  });

  it("uses start height plus delta when available", () => {
    const nextHeight = getPinnedResizeHeight({
      didResize: true,
      delta: { height: 20, width: 0 },
      startHeight: 120,
      styleHeight: null,
      minHeight: 80,
    });

    expect(nextHeight).toBe(140);
  });

  it("clamps to min height", () => {
    const nextHeight = getPinnedResizeHeight({
      didResize: true,
      delta: { height: -80, width: 0 },
      startHeight: 100,
      styleHeight: null,
      minHeight: 60,
    });

    expect(nextHeight).toBe(60);
  });

  it("clamps to max height when provided", () => {
    const nextHeight = getPinnedResizeHeight({
      didResize: true,
      delta: { height: 50, width: 0 },
      startHeight: 100,
      styleHeight: null,
      minHeight: 60,
      maxHeight: 120,
    });

    expect(nextHeight).toBe(120);
  });
});
