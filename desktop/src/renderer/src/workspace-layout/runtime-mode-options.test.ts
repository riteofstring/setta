import { describe, expect, test } from "vitest";

import {
  benchmarkHostPoolSizeFromSearch,
  benchmarkSceneOptionsFromSearch,
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

  test("parses explicit benchmark scene sizing from the URL search", () => {
    expect(
      benchmarkSceneOptionsFromSearch(
        "?workspaceBenchmarkPaneCount=17&workspaceBenchmarkVisiblePanes=17",
      ),
    ).toStrictEqual({
      paneCount: 17,
      targetVisiblePanes: 17,
    });
    expect(
      benchmarkHostPoolSizeFromSearch(
        "?workspaceBenchmarkPaneCount=17&workspaceBenchmarkVisiblePanes=17",
      ),
    ).toBe(17);
  });

  test("rejects invalid benchmark scene sizing", () => {
    expect(() => benchmarkSceneOptionsFromSearch("?workspaceBenchmarkPaneCount=0")).toThrow(
      "workspaceBenchmarkPaneCount must be a positive integer: 0",
    );
    expect(() =>
      benchmarkSceneOptionsFromSearch("?workspaceBenchmarkVisiblePanes=not-a-number"),
    ).toThrow("workspaceBenchmarkVisiblePanes must be a positive integer: not-a-number");
  });
});
