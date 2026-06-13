import { describe, expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { WorkflowGraphProjection } from "@generated/backend";
import {
  WorkflowGraphToolbar,
  workflowToolbarMismatchLabel,
  workflowToolbarStateLabel,
  workflowToolbarVersionLabel,
} from "./workflow-graph-toolbar";

describe("workflow graph toolbar state labels", () => {
  test("names editable draft state explicitly", () => {
    const projection = workflowProjection({ viewMode: "draft" });

    expect(workflowToolbarStateLabel(projection, true, "workspace_test")).toBe("Draft editable");
    expect(workflowToolbarVersionLabel(projection)).toBe("");
    expect(workflowToolbarMismatchLabel(projection)).toBe("");
  });

  test("names selected run and immutable version explicitly", () => {
    const projection = workflowProjection({ viewMode: "run" });

    expect(workflowToolbarStateLabel(projection, true, "workspace_test")).toBe(
      "Run completed read-only",
    );
    expect(workflowToolbarVersionLabel(projection)).toBe(
      "run workflow_e...on_run / v3 workflow_v...on_003",
    );
  });

  test("marks run projections whose selected version differs from the current draft", () => {
    const projection = workflowProjection({ versionMismatch: true, viewMode: "run" });

    expect(workflowToolbarMismatchLabel(projection)).toBe(
      "Current draft differs from this version",
    );
  });

  test("names read-only version snapshots without a selected run", () => {
    const projection = workflowProjection({
      executionId: "",
      executionStatus: null,
      viewMode: "version",
    });

    expect(workflowToolbarStateLabel(projection, true, "workspace_test")).toBe(
      "Version snapshot read-only",
    );
    expect(workflowToolbarVersionLabel(projection)).toBe("v3 workflow_v...on_003");
  });

  test("keeps async operation status separate from visible command labels", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowGraphToolbar, {
        busy: "validate",
        onAddNode: () => undefined,
        onOpenDetails: () => undefined,
        onOpenSettings: () => undefined,
        onRun: () => undefined,
        onShowDraft: () => undefined,
        onValidate: () => undefined,
        projection: workflowProjection({ viewMode: "draft" }),
        ready: true,
        selectedNodeLabel: "",
        validation: null,
        workspaceId: "workspace_test",
      }),
    );

    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-label="Validate"');
    expect(html).toContain(">Validate</span>");
    expect(html).not.toContain("Validating workflow");
    expect(html).not.toContain(">Validating</span>");
  });

  test("keeps validated status visible from projection validation state", () => {
    const validation = { diagnostics: [], valid: true };
    const html = renderToStaticMarkup(
      createElement(WorkflowGraphToolbar, {
        busy: null,
        onAddNode: () => undefined,
        onOpenDetails: () => undefined,
        onOpenSettings: () => undefined,
        onRun: () => undefined,
        onShowDraft: () => undefined,
        onValidate: () => undefined,
        projection: workflowProjection({
          validation: workflowValidationState(validation),
          viewMode: "draft",
        }),
        ready: true,
        selectedNodeLabel: "",
        validation,
        workspaceId: "workspace_test",
      }),
    );

    expect(html).toContain(">Validated</span>");
    expect(html).toContain('aria-label="Workflow validated"');
  });
});

function workflowProjection(
  overrides: Partial<WorkflowGraphProjection> = {},
): WorkflowGraphProjection {
  const viewMode = overrides.viewMode ?? "run";
  const versionMismatch = overrides.versionMismatch === true;
  return {
    definitionDescription: "",
    definitionId: "workflow_definition",
    definitionName: "Review workflow",
    ...workflowProjectionDefaultsByViewMode[viewMode],
    draftMatchesVersion: !versionMismatch,
    draftRevision: "sha256:draft",
    draftUpdatedAt: "2026-06-08T12:10:00Z",
    edges: [],
    layout: { nodes: [] },
    nodes: [],
    schemaVersion: 1,
    terminalReason: null,
    updatedAt: "2026-06-08T12:15:00Z",
    validation: workflowValidationState(null),
    versionMismatch,
    viewMode,
    workspaceId: "workspace_test",
    ...overrides,
  };
}

const workflowProjectionDefaultsByViewMode = {
  draft: {
    definitionVersionCreatedAt: "",
    definitionVersionId: "",
    definitionVersionNumber: 0,
    editable: true,
    executionId: "",
    executionStatus: null,
    lastEventOrdinal: 0,
  },
  run: {
    definitionVersionCreatedAt: "2026-06-08T12:00:00Z",
    definitionVersionId: "workflow_version_003",
    definitionVersionNumber: 3,
    editable: false,
    executionId: "workflow_execution_run",
    executionStatus: "completed",
    lastEventOrdinal: 7,
  },
  version: {
    definitionVersionCreatedAt: "2026-06-08T12:00:00Z",
    definitionVersionId: "workflow_version_003",
    definitionVersionNumber: 3,
    editable: false,
    executionId: "",
    executionStatus: null,
    lastEventOrdinal: 0,
  },
} satisfies Record<
  WorkflowGraphProjection["viewMode"],
  Pick<
    WorkflowGraphProjection,
    | "definitionVersionCreatedAt"
    | "definitionVersionId"
    | "definitionVersionNumber"
    | "editable"
    | "executionId"
    | "executionStatus"
    | "lastEventOrdinal"
  >
>;

function workflowValidationState(
  result: NonNullable<WorkflowGraphProjection["validation"]["snapshot"]>["result"] | null,
) {
  return {
    currentDraftRevision: "sha256:draft",
    currentGraphFingerprint: "sha256:graph",
    currentValidatorFingerprint: "workflow-validator:v1",
    snapshot:
      result === null
        ? null
        : {
            definitionId: "workflow_definition",
            graphFingerprint: "sha256:graph",
            result,
            schemaVersion: 1,
            validatedAt: "2026-06-08T12:16:00Z",
            validatorFingerprint: "workflow-validator:v1",
            workspaceId: "workspace_test",
          },
    status: result === null ? "not_validated" : "current",
  } satisfies WorkflowGraphProjection["validation"];
}
