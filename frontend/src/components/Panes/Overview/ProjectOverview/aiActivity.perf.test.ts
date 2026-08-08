import { AgentRunStatusEnum, createAgentRun } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { getActiveSectionIdsFromRuns } from "./aiActivity";

describe("aiActivity (perf)", () => {
  it("keeps active-section extraction fast for large run lists", () => {
    const runs = Array.from({ length: 12000 }, (_, index) =>
      createAgentRun({
        status:
          index % 3 === 0
            ? AgentRunStatusEnum.running
            : AgentRunStatusEnum.completed,
        inputs:
          index % 5 === 0
            ? {
                sectionId: `section-${index % 400}`,
                projectConfigId:
                  index % 2 === 0 ? "project-main" : "project-alt",
              }
            : { sectionId: null, projectConfigId: "project-main" },
      }),
    );

    const start = performance.now();
    for (let index = 0; index < 120; index += 1) {
      getActiveSectionIdsFromRuns(runs, "project-main");
    }
    const elapsedMs = performance.now() - start;

    // Structural perf guard to catch O(n^2)-style regressions.
    expect(elapsedMs).toBeLessThan(500);
  });
});
