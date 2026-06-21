import { describe, expect, test } from "vitest";

import type { WorkflowEvent } from "@generated/backend";
import {
  workflowEventMatchesProjectionTarget,
  workflowEventRefreshesProjectionTarget,
} from "./workflow-graph-projection-state";

describe("workflow projection event targeting", () => {
  test("matches draft definition events without refreshing the graph projection", () => {
    const current = draftTarget({ definitionId: "definition" });
    const incoming = event({
      definitionId: "definition",
      executionId: "execution",
      versionId: "version",
    });

    expect(workflowEventMatchesProjectionTarget(current, incoming)).toBe(true);
    expect(workflowEventRefreshesProjectionTarget(current, incoming)).toBe(false);
  });

  test("accepts only the active execution once the run projection is selected", () => {
    const current = runTarget({
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
      workflowEventRefreshesProjectionTarget(
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
        versionTarget({ definitionId: "definition", versionId: "version_a" }),
        event({ definitionId: "definition", executionId: "execution", versionId: "version_b" }),
      ),
    ).toBe(false);
  });

  test("rejects events for unrelated workspaces or definitions", () => {
    expect(
      workflowEventMatchesProjectionTarget(
        draftTarget({ definitionId: "definition", workspaceId: "workspace_a" }),
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
        draftTarget({ definitionId: "definition_a" }),
        event({ definitionId: "definition_b", executionId: "execution", versionId: "version" }),
      ),
    ).toBe(false);
  });
});

function draftTarget({
  definitionId,
  workspaceId = "workspace",
}: {
  definitionId: string;
  workspaceId?: string;
}) {
  return {
    definitionId,
    kind: "draft" as const,
    workspaceId,
  };
}

function runTarget({
  definitionId,
  executionId,
  versionId,
  workspaceId = "workspace",
}: {
  definitionId: string;
  executionId: string;
  versionId: string;
  workspaceId?: string;
}) {
  return {
    definitionId,
    executionId,
    kind: "run" as const,
    versionId,
    workspaceId,
  };
}

function versionTarget({
  definitionId,
  versionId,
  workspaceId = "workspace",
}: {
  definitionId: string;
  versionId: string;
  workspaceId?: string;
}) {
  return {
    definitionId,
    kind: "version" as const,
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
