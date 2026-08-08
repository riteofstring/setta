import { describe, expect, it } from "vitest";
import { resolveAgentRunsPollIntervalMs } from "./ProjectOverview";

describe("resolveAgentRunsPollIntervalMs", () => {
  it("uses fast polling while runs are active", () => {
    expect(
      resolveAgentRunsPollIntervalMs({
        hasLoadError: false,
        hasRunningRuns: true,
      }),
    ).toBe(2500);
  });

  it("uses fast polling while recovering from agent run load errors", () => {
    expect(
      resolveAgentRunsPollIntervalMs({
        hasLoadError: true,
        hasRunningRuns: false,
      }),
    ).toBe(2500);
  });

  it("uses slower idle polling when no runs are active and no error is present", () => {
    expect(
      resolveAgentRunsPollIntervalMs({
        hasLoadError: false,
        hasRunningRuns: false,
      }),
    ).toBe(20000);
  });
});
