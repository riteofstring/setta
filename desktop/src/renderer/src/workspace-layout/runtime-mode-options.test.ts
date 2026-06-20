import { describe, expect, test } from "vitest";

import {
  runtimePolicyOptionsForRuntime,
  workflowGraphSyntheticGraphFallbackForRuntime,
} from "./runtime-mode-options";

describe("workspace runtime mode options", () => {
  test("keeps benchmark overview degradation for the synthetic stress scene", () => {
    expect(runtimePolicyOptionsForRuntime("benchmark")).toStrictEqual({
      degradeDuringMovement: true,
      degradeOverview: true,
    });
  });

  test("keeps workspace movement live while using snapshots in overview", () => {
    expect(runtimePolicyOptionsForRuntime("workspace")).toStrictEqual({
      degradeDuringMovement: false,
      degradeOverview: true,
    });
  });

  test("uses a synthetic workflow graph fallback only for the benchmark stress scene", () => {
    expect(workflowGraphSyntheticGraphFallbackForRuntime("benchmark")).toStrictEqual({
      edgesPerNode: 2,
      nodeCount: 500,
    });
    expect(workflowGraphSyntheticGraphFallbackForRuntime("workspace")).toBeUndefined();
  });
});
