import { createViewModeConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { reorderViewModeIdList, sortViewModes } from "./viewModeOrdering";

describe("viewModeOrdering (perf)", () => {
  it("sorts large view mode arrays within an interactive budget", () => {
    const viewModes = Array.from({ length: 20_000 }, (_, index) =>
      createViewModeConfig({
        id: `mode-${index}`,
        name: `Mode ${20_000 - index}`,
        sortIndex: 20_000 - index,
      }),
    );

    const start = performance.now();
    const sorted = sortViewModes(viewModes);
    const elapsedMs = performance.now() - start;

    expect(sorted[0]?.id).toBe("mode-19999");
    expect(sorted[sorted.length - 1]?.id).toBe("mode-0");
    // High threshold by design: this is a regression guard, not a microbenchmark.
    expect(elapsedMs).toBeLessThan(1800);
  });

  it("reorders large tab id lists without quadratic slowdown", () => {
    const ids = Array.from({ length: 15_000 }, (_, index) => `mode-${index}`);

    const start = performance.now();
    const reordered = reorderViewModeIdList(ids, "mode-14999", "mode-10");
    const elapsedMs = performance.now() - start;

    expect(reordered[10]).toBe("mode-14999");
    expect(reordered).toHaveLength(ids.length);
    expect(elapsedMs).toBeLessThan(250);
  });
});
