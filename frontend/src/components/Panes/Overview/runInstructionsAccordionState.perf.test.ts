import { describe, expect, it } from "vitest";
import { normalizeRunInstructionsAccordionOpenValues } from "./runInstructionsAccordionState";

const STRICT_PERF_BUDGETS_ENABLED = process.env.SETTA_STRICT_PERF === "1";
const EXPECTED_ORDER = [
  "run-instructions-run-snapshot-mode",
  "run-instructions-codegen-targets",
  "run-instructions-codegen-policy",
  "run-instructions-workflow-controls",
  "run-instructions-custom-runs",
  "run-instructions-add-from-code-blocks",
] as const;

describe("runInstructionsAccordionState (perf)", () => {
  it("normalizes large persisted payloads quickly for pane startup", () => {
    const noisyPayload: Array<string> = [];
    for (let i = 0; i < 80_000; i += 1) {
      if (i % 8_000 === 0) {
        noisyPayload.push(EXPECTED_ORDER[(i / 8_000) % EXPECTED_ORDER.length]);
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

    expect(normalized).toEqual(EXPECTED_ORDER);

    if (STRICT_PERF_BUDGETS_ENABLED) {
      // Optional strict perf budget for dedicated perf runs.
      expect(elapsedMs).toBeLessThan(2_500);
    }
  });
});
