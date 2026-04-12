import { describe, expect, it } from "vitest";
import { normalizeRunInstructionsAccordionOpenValues } from "./runInstructionsAccordionState";

describe("runInstructionsAccordionState", () => {
  it("keeps stable accordion order and drops stale persisted values", () => {
    // LocalStorage payloads can contain values from prior accordion layouts.
    const normalized = normalizeRunInstructionsAccordionOpenValues([
      "run-instructions-custom-runs",
      "unknown-value",
      "run-instructions-codegen-policy",
      "run-instructions-run-snapshot-mode",
    ]);

    expect(normalized).toEqual([
      "run-instructions-run-snapshot-mode",
      "run-instructions-codegen-policy",
      "run-instructions-custom-runs",
    ]);
  });

  it("deduplicates repeated values and only keeps known accordion items", () => {
    // Duplicate entries can appear when toggles are rapidly persisted.
    const normalized = normalizeRunInstructionsAccordionOpenValues([
      "run-instructions-codegen-targets",
      "run-instructions-codegen-targets",
      "run-instructions-add-from-code-blocks",
      "run-instructions-add-from-code-blocks",
    ]);

    expect(normalized).toEqual([
      "run-instructions-codegen-targets",
      "run-instructions-add-from-code-blocks",
    ]);
  });
});
