import type { WorkflowGraphProjection, WorkflowValidationResult } from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import { afterEach, describe, expect, test, vi } from "vitest";

import { startWorkflowDraftRun } from "./workflow-graph-run-start";

describe("startWorkflowDraftRun draft validation overlay", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  test("starts the run without re-touching the validation overlay when valid", async () => {
    const calls: string[] = [];
    installWorkflowApi({
      readDefinition: vi.fn(async () => ({ graph: { edges: [], nodes: [] } })),
      startExecution: vi.fn(async () => {
        calls.push("startExecution");
        return { definitionVersionId: "workflow_version_001", id: "workflow_execution_001" };
      }),
      validateDefinition: vi.fn(async () => workflowValidation({ valid: true })),
    });
    const setWorkflowValidation = vi.fn();
    const loadWorkflowGraphTarget = vi.fn(async () => {
      calls.push("loadWorkflowGraphTarget");
    });
    const refreshWorkflowRunSummaries = vi.fn(async () => {
      calls.push("refreshWorkflowRunSummaries");
      return [];
    });

    await startWorkflowDraftRun({
      loadWorkflowGraphTarget,
      projection: draftProjection(),
      refreshWorkflowRunSummaries,
      setWorkflowValidation,
    });

    // The caller clears the validation overlay synchronously on run-accept (before the Starting
    // frame). The valid path must not re-touch it; a redundant set could flash the panel back
    // during the run start.
    expect(setWorkflowValidation).not.toHaveBeenCalled();
    expect(loadWorkflowGraphTarget).toHaveBeenCalledWith(
      {
        definitionId: "workflow_definition_001",
        executionId: "workflow_execution_001",
        kind: "run",
        versionId: "workflow_version_001",
        workspaceId: "workspace_test",
      },
      "draft-validation-local",
    );
    expect(calls).toEqual([
      "startExecution",
      "refreshWorkflowRunSummaries",
      "loadWorkflowGraphTarget",
    ]);
  });

  test("keeps the draft validation panel and starts no run when invalid", async () => {
    const validation = workflowValidation({
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
    });
    const startExecution = vi.fn();
    const loadWorkflowGraphTarget = vi.fn();
    const refreshWorkflowRunSummaries = vi.fn();
    installWorkflowApi({
      readDefinition: vi.fn(async () => ({ graph: { edges: [], nodes: [] } })),
      startExecution,
      validateDefinition: vi.fn(async () => validation),
    });
    const setWorkflowValidation = vi.fn();

    await startWorkflowDraftRun({
      loadWorkflowGraphTarget,
      projection: draftProjection(),
      refreshWorkflowRunSummaries,
      setWorkflowValidation,
    });

    expect(setWorkflowValidation).toHaveBeenCalledTimes(1);
    expect(setWorkflowValidation).toHaveBeenCalledWith(validation);
    expect(startExecution).not.toHaveBeenCalled();
    expect(loadWorkflowGraphTarget).not.toHaveBeenCalled();
    expect(refreshWorkflowRunSummaries).not.toHaveBeenCalled();
  });
});

function installWorkflowApi(workflow: {
  readDefinition: () => Promise<{ graph: unknown }>;
  startExecution: () => Promise<{ definitionVersionId: string; id: string }>;
  validateDefinition: () => Promise<WorkflowValidationResult>;
}) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setta: { workflow } as unknown as SettaAPI },
  });
}

function workflowValidation(
  overrides: Partial<WorkflowValidationResult> = {},
): WorkflowValidationResult {
  return {
    diagnostics: [],
    valid: true,
    ...overrides,
  };
}

function draftProjection(): WorkflowGraphProjection {
  return {
    definitionDescription: "",
    definitionId: "workflow_definition_001",
    definitionName: "Review workflow",
    definitionVersionCreatedAt: "",
    definitionVersionId: "",
    definitionVersionNumber: 0,
    draftMatchesVersion: true,
    draftUpdatedAt: "2026-06-24T12:00:00Z",
    edges: [],
    editable: true,
    executionId: "",
    executionStatus: null,
    lastEventOrdinal: 0,
    layout: { nodes: [] },
    nodes: [],
    schemaVersion: 1,
    terminalReason: null,
    updatedAt: "2026-06-24T12:00:00Z",
    versionMismatch: false,
    viewMode: "draft",
    workspaceId: "workspace_test",
  };
}
