import { describe, expect, test } from "vitest";

import { ResizePhaseTracker } from "./resize-phase-tracker";
import type { Rect } from "./types";

describe("workspace resize phase tracker", () => {
  test("stays active while viewport dimensions change and emits one settled frame", () => {
    const tracker = new ResizePhaseTracker(100);

    expect(tracker.sample(rect(1000, 800), 0)).toBe("idle");
    expect(tracker.sample(rect(980, 780), 16)).toBe("active");
    expect(tracker.sample(rect(960, 760), 48)).toBe("active");
    expect(tracker.sample(rect(960, 760), 96)).toBe("active");
    expect(tracker.sample(rect(960, 760), 147)).toBe("active");
    expect(tracker.sample(rect(960, 760), 148)).toBe("settled");
    expect(tracker.sample(rect(960, 760), 166)).toBe("idle");
  });
});

function rect(width: number, height: number): Rect {
  return {
    height,
    width,
    x: 0,
    y: 0,
  };
}
