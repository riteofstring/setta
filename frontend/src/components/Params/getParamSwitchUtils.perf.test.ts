import { describe, expect, it } from "vitest";
import {
  buildFilteredRequiredParamSet,
  filterParamIdsForRender,
} from "./getParamSwitchUtils";

const STRICT_PERF_BUDGETS_ENABLED = process.env.SETTA_STRICT_PERF === "1";

describe("getParamSwitchUtils (perf)", () => {
  it("filters large required-path maps within an interactive budget", () => {
    const requiredParamIdsToPaths: Record<string, string[]> = {};
    const paramIds: string[] = [];

    for (let index = 0; index < 1300; index += 1) {
      const paramId = `param-${index}`;
      const parentId = `group-${Math.floor(index / 10)}`;
      requiredParamIdsToPaths[paramId] = ["root", parentId, paramId];
      paramIds.push(parentId, paramId);
    }

    const start = performance.now();
    let visibleCount = 0;
    for (let index = 0; index < 220; index += 1) {
      const filteredRequiredParamIds = buildFilteredRequiredParamSet({
        paramFilter: `param-12`,
        requiredParamIdsToPaths,
        getParamName: (paramId) => paramId,
      });
      const visibleParamIds = filterParamIdsForRender(
        paramIds,
        filteredRequiredParamIds,
      );
      visibleCount += visibleParamIds.length;
    }
    const elapsedMs = performance.now() - start;

    expect(visibleCount).toBeGreaterThan(0);
    if (STRICT_PERF_BUDGETS_ENABLED) {
      expect(elapsedMs).toBeLessThan(2200);
    }
  });
});
