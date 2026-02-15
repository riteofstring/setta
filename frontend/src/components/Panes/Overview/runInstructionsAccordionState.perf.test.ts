import { describe, expect, it } from "vitest";
import {
  RUN_INSTRUCTIONS_ACCORDION_ITEM_ORDER,
  normalizeRunInstructionsAccordionOpenValues,
} from "./runInstructionsAccordionState";

describe("runInstructionsAccordionState (perf)", () => {
  it("normalizes large persisted payloads quickly for pane startup", () => {
    const noisyPayload: Array<string> = [];
    for (let i = 0; i < 80_000; i += 1) {
      if (i % 8_000 === 0) {
        noisyPayload.push(
          RUN_INSTRUCTIONS_ACCORDION_ITEM_ORDER[
            (i / 8_000) % RUN_INSTRUCTIONS_ACCORDION_ITEM_ORDER.length
          ],
        );
      } else {
        noisyPayload.push(`noise-${i}`);
      }
    }

    const start = performance.now();
    let normalized: Array<string> = [];
    for (let i = 0; i < 120; i += 1) {
      normalized = normalizeRunInstructionsAccordionOpenValues(noisyPayload);
    }
    const elapsedMs = performance.now() - start;

    expect(normalized).toEqual(RUN_INSTRUCTIONS_ACCORDION_ITEM_ORDER);

    // Generous threshold to catch algorithmic regressions without flaking.
    expect(elapsedMs).toBeLessThan(2_500);
  });
});
