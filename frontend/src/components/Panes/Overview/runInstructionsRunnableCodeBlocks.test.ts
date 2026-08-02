import { createSectionCapabilities } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { isRunnableSectionForCustomRun } from "./runInstructionsRunnableCodeBlocks";

describe("isRunnableSectionForCustomRun", () => {
  it("treats backend-runnable sections as runnable", () => {
    expect(
      isRunnableSectionForCustomRun(
        createSectionCapabilities({ canRun: true }),
      ),
    ).toBe(true);
  });

  it("treats backend-disabled sections as non-runnable", () => {
    expect(
      isRunnableSectionForCustomRun(
        createSectionCapabilities({
          canRun: false,
          runDisabledReason: "Select a manual code section to run.",
        }),
      ),
    ).toBe(false);
  });

  it("treats missing section capabilities as non-runnable", () => {
    expect(isRunnableSectionForCustomRun(null)).toBe(false);
  });
});
