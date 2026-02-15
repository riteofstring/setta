import { describe, expect, it } from "vitest";
import {
  PROJECT_AI_SETTINGS_ACCORDION_ITEM_ORDER,
  normalizeProjectAISettingsAccordionOpenValues,
} from "./projectAISettingsAccordionState";

describe("projectAISettingsAccordionState (perf)", () => {
  it("normalizes large persisted payloads fast enough for interactive pane loads", () => {
    const noisyPayload: Array<string> = [];
    for (let i = 0; i < 80_000; i += 1) {
      if (i % 5_000 === 0) {
        noisyPayload.push(
          PROJECT_AI_SETTINGS_ACCORDION_ITEM_ORDER[
            (i / 5_000) % PROJECT_AI_SETTINGS_ACCORDION_ITEM_ORDER.length
          ],
        );
      } else {
        noisyPayload.push(`noise-${i}`);
      }
    }

    const start = performance.now();
    let normalized: Array<string> = [];
    for (let i = 0; i < 120; i += 1) {
      normalized = normalizeProjectAISettingsAccordionOpenValues(noisyPayload);
    }
    const elapsedMs = performance.now() - start;

    expect(normalized).toEqual(PROJECT_AI_SETTINGS_ACCORDION_ITEM_ORDER);

    // Generous threshold to catch algorithmic regressions without flaking.
    expect(elapsedMs).toBeLessThan(2_500);
  });
});
