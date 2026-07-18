import type { WorkflowGraphProjection, WorkflowValidationResult } from "@generated/backend";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { WorkflowValidationLayer } from "./workflow-graph-surface-layers";

describe("WorkflowValidationLayer draft scoping", () => {
  test("renders the validation panel over the editable draft", () => {
    const html = renderToString(
      <WorkflowValidationLayer
        projection={draftProjection()}
        workflowValidation={invalidValidation()}
      />,
    );

    expect(html).toContain("workflow-validation-panel");
    expect(html).toContain("Workflow draft has issues");
    expect(html).toContain("Workflow needs a start node");
  });

  test("renders nothing without a validation result", () => {
    const html = renderToString(
      <WorkflowValidationLayer projection={draftProjection()} workflowValidation={null} />,
    );

    expect(html).toBe("");
  });

  test("keeps the validation panel out of a run view even with a stale result", () => {
    // A stale validation result must not leave DOM in the way of the run graph: the layer is
    // gated on the displayed draft view, so it renders nothing for a run projection.
    const html = renderToString(
      <WorkflowValidationLayer
        projection={runProjection()}
        workflowValidation={invalidValidation()}
      />,
    );

    expect(html).toBe("");
  });
});

function invalidValidation(): WorkflowValidationResult {
  return {
    diagnostics: [
      {
        code: "missing_start",
        edgeId: "",
        message: "Workflow needs a start node",
        nodeId: "",
        severity: "error",
      },
    ],
    valid: false,
  };
}

function draftProjection(): WorkflowGraphProjection {
  return projection({
    definitionVersionCreatedAt: "",
    definitionVersionId: "",
    definitionVersionNumber: 0,
    editable: true,
    executionId: "",
    executionStatus: null,
    viewMode: "draft",
  });
}

function runProjection(): WorkflowGraphProjection {
  return projection({
    definitionVersionCreatedAt: "2026-06-24T12:00:00Z",
    definitionVersionId: "workflow_version_003",
    definitionVersionNumber: 3,
    editable: false,
    executionId: "workflow_execution_run",
    executionStatus: "running",
    viewMode: "run",
  });
}

function projection(
  overrides: Pick<
    WorkflowGraphProjection,
    | "definitionVersionCreatedAt"
    | "definitionVersionId"
    | "definitionVersionNumber"
    | "editable"
    | "executionId"
    | "executionStatus"
    | "viewMode"
  >,
): WorkflowGraphProjection {
  return {
    definitionDescription: "",
    definitionId: "workflow_definition_001",
    definitionName: "Review workflow",
    draftMatchesVersion: true,
    draftUpdatedAt: "2026-06-24T12:00:00Z",
    edges: [],
    lastEventOrdinal: 0,
    layout: { nodes: [] },
    nodes: [],
    schemaVersion: 1,
    terminalReason: null,
    updatedAt: "2026-06-24T12:00:00Z",
    versionMismatch: false,
    workspaceId: "workspace_test",
    ...overrides,
  };
}
