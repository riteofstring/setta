import { describe, expect, it } from "vitest";
import { getObservedElementHeight } from "./heightMeasurements";

describe("getObservedElementHeight", () => {
  it("uses ResizeObserver border-box height when present", () => {
    // Validates we consume observer-provided box size without forcing layout reads.
    const entry = {
      borderBoxSize: [{ blockSize: 120, inlineSize: 0 }],
      contentRect: { height: 88 },
    };
    let fallbackCalls = 0;

    const height = getObservedElementHeight({
      entry,
      getFallbackOffsetHeight: () => {
        fallbackCalls += 1;
        return 33;
      },
    });

    expect(height).toBe(120);
    expect(fallbackCalls).toBe(0);
  });

  it("falls back to contentRect height when border-box size is absent", () => {
    // Validates compatibility path for environments without borderBoxSize.
    const entry = {
      borderBoxSize: [],
      contentRect: { height: 91 },
    };

    const height = getObservedElementHeight({
      entry,
      getFallbackOffsetHeight: () => 33,
    });

    expect(height).toBe(91);
  });

  it("falls back to offsetHeight when observer entry is missing", () => {
    // Validates first-measure and non-observer calls still compute a height.
    const height = getObservedElementHeight({
      entry: null,
      getFallbackOffsetHeight: () => 47,
    });

    expect(height).toBe(47);
  });
});
