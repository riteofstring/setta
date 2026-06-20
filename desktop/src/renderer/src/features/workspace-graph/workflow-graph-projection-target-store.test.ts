import { beforeEach, describe, expect, test, vi } from "vitest";

import { testWorkflowGraphProjection } from "./workflow-graph-view-layout.testdata";
import {
  readWorkflowGraphProjectionFocusTarget,
  workflowGraphProjectionFocusTargetForProjection,
  writeWorkflowGraphProjectionFocusTarget,
} from "./workflow-graph-projection-target-store";

describe("workflow graph projection target store", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: localStorageStub(),
    });
  });

  test("stores run projection targets by surface", () => {
    const projection = testWorkflowGraphProjection();

    writeWorkflowGraphProjectionFocusTarget("surface_run", projection);

    expect(readWorkflowGraphProjectionFocusTarget("surface_run")).toEqual({
      definitionId: "definition_review",
      executionId: "execution_review",
      versionId: "version_review",
      viewMode: "run",
      workspaceId: "workspace_test",
    });
  });

  test("clears the stored target for draft projections", () => {
    const projection = testWorkflowGraphProjection();
    writeWorkflowGraphProjectionFocusTarget("surface_draft", projection);

    writeWorkflowGraphProjectionFocusTarget("surface_draft", {
      ...projection,
      definitionVersionId: "",
      editable: true,
      executionId: "",
      executionStatus: null,
      viewMode: "draft",
    });

    expect(readWorkflowGraphProjectionFocusTarget("surface_draft")).toBeNull();
  });

  test("does not store incomplete run targets", () => {
    expect(
      workflowGraphProjectionFocusTargetForProjection({
        ...testWorkflowGraphProjection(),
        executionId: "",
      }),
    ).toBeNull();
  });

  test("fails loudly for corrupt stored targets", () => {
    window.localStorage.setItem(
      "setta.workflowGraph.projectionTarget.v1:surface_corrupt",
      JSON.stringify({ schemaVersion: 0 }),
    );

    expect(() => readWorkflowGraphProjectionFocusTarget("surface_corrupt")).toThrow(
      /Unsupported workflow graph projection target schema version/,
    );
  });
});

function localStorageStub(): Storage {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  } as Storage;
}
