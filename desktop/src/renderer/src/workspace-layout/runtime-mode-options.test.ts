import { describe, expect, test } from "vitest";

import {
  presentationOptionsForRuntime,
  runtimePolicyOptionsForRuntime,
  workflowGraphSyntheticGraphFallbackForRuntime,
} from "./runtime-mode-options";
import type { WorkspaceSceneMode } from "./runtime-mode-options";

describe("workspace runtime mode options", () => {
  test.each(["benchmark", "workspace"] satisfies WorkspaceSceneMode[])(
    "disables sync-all content updates during movement for %s mode",
    (mode) => {
      expect(presentationOptionsForRuntime(mode)).toStrictEqual({
        syncAllRenderedContentDuringMovement: false,
      });
    },
  );

  test("keeps benchmark overview degradation for the synthetic stress scene", () => {
    expect(runtimePolicyOptionsForRuntime("benchmark")).toStrictEqual({
      degradeDuringMovement: true,
      degradeOverview: true,
    });
  });

  test("uses movement and overview degradation in real workspace mode", () => {
    expect(runtimePolicyOptionsForRuntime("workspace")).toStrictEqual({
      degradeDuringMovement: true,
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
