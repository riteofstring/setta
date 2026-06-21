import { describe, expect, test } from "vitest";

import type { WorkflowEvent } from "@generated/backend";
import { workflowEventMatchesProjectionTarget } from "./workflow-graph-projection-state";

describe("workflow projection event targeting", () => {
  test("accepts a run event for the selected draft definition", () => {
    expect(
      workflowEventMatchesProjectionTarget(
        target({ definitionId: "definition", executionId: "", versionId: "" }),
        event({ definitionId: "definition", executionId: "execution", versionId: "version" }),
      ),
    ).toBe(true);
  });

  test("accepts only the active execution once the run projection is selected", () => {
    const current = target({
      definitionId: "definition",
      executionId: "execution_active",
      versionId: "version",
    });

    expect(
      workflowEventMatchesProjectionTarget(
        current,
        event({
          definitionId: "definition",
          executionId: "execution_active",
          versionId: "version",
        }),
      ),
    ).toBe(true);
    expect(
      workflowEventMatchesProjectionTarget(
        current,
        event({
          definitionId: "definition",
          executionId: "execution_other",
          versionId: "version",
        }),
      ),
    ).toBe(false);
  });

  test("does not switch a version projection to a different definition version", () => {
    expect(
      workflowEventMatchesProjectionTarget(
        target({ definitionId: "definition", executionId: "", versionId: "version_a" }),
        event({ definitionId: "definition", executionId: "execution", versionId: "version_b" }),
      ),
    ).toBe(false);
  });

  test("rejects events for unrelated workspaces or definitions", () => {
    expect(
      workflowEventMatchesProjectionTarget(
        target({ definitionId: "definition", executionId: "", workspaceId: "workspace_a" }),
        event({
          definitionId: "definition",
          executionId: "execution",
          versionId: "version",
          workspaceId: "workspace_b",
        }),
      ),
    ).toBe(false);
    expect(
      workflowEventMatchesProjectionTarget(
        target({ definitionId: "definition_a", executionId: "" }),
        event({ definitionId: "definition_b", executionId: "execution", versionId: "version" }),
      ),
    ).toBe(false);
  });
});

function target({
  definitionId,
  executionId,
  versionId = "",
  workspaceId = "workspace",
}: {
  definitionId: string;
  executionId: string;
  versionId?: string;
  workspaceId?: string;
}) {
  return {
    definitionId,
    executionId,
    versionId,
    workspaceId,
  };
}

function event({
  definitionId,
  executionId,
  versionId,
  workspaceId = "workspace",
}: {
  definitionId: string;
  executionId: string;
  versionId: string;
  workspaceId?: string;
}): WorkflowEvent {
  return {
    createdAt: "2026-06-22T12:00:00Z",
    definitionId,
    definitionVersionId: versionId,
    details: null,
    executionId,
    id: "event_" + executionId,
    message: "started",
    nodeExecutionId: "",
    nodeId: "",
    ordinal: 1,
    runnerKind: null,
    schemaVersion: 1,
    tokenId: "",
    type: "workflow.execution.started",
    workspaceId,
  };
}
