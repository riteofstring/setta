import { describe, expect, test } from "vitest";

import type { WorkflowExecutionSummary, WorkflowGraphProjection } from "@generated/backend";
import {
  workflowActiveRunSummary,
  workflowDraftButtonLabel,
  workflowDraftButtonTitle,
  workflowToolbarDisabled,
  workflowToolbarMismatchLabel,
  workflowToolbarShowsRunButton,
  workflowToolbarShowsStopButton,
  workflowToolbarStateLabel,
  workflowToolbarVersionLabel,
  workflowRunSelectorItems,
} from "./workflow-graph-toolbar";

describe("workflow graph toolbar state labels", () => {
  test("names editable draft state explicitly", () => {
    const projection = workflowProjection({ viewMode: "draft" });

    expect(workflowToolbarStateLabel(projection, true, "workspace_test", false)).toBe(
      "Draft editable",
    );
    expect(workflowToolbarVersionLabel(projection)).toBe("");
    expect(workflowToolbarMismatchLabel(projection)).toBe("");
  });

  test("reports loading over a still-displayed projection during a warm switch", () => {
    const projection = workflowProjection({ viewMode: "draft" });

    // ready stays true (the previous graph is still rendered) but a load is in flight, so the
    // stable toolbar shows the subtle loading state instead of the displayed view's label.
    expect(workflowToolbarStateLabel(projection, true, "workspace_test", true)).toBe("Loading");
  });

  test("names selected run and immutable version explicitly", () => {
    const projection = workflowProjection({ viewMode: "run" });

    expect(workflowToolbarStateLabel(projection, true, "workspace_test", false)).toBe(
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

    expect(workflowToolbarStateLabel(projection, true, "workspace_test", false)).toBe(
      "Version snapshot read-only",
    );
    expect(workflowToolbarVersionLabel(projection)).toBe("v3 workflow_v...on_003");
  });
});

describe("workflow graph toolbar action availability", () => {
  test("disables actions while a newly selected target loads", () => {
    // A warm switch keeps ready true so the canvas holds the previous graph, but the in-flight
    // load must still disable the toolbar actions for the projection about to be replaced.
    expect(workflowToolbarDisabled(true, "workspace_test", null, true)).toBe(true);
  });

  test("keeps actions enabled once the selected target has settled", () => {
    expect(workflowToolbarDisabled(true, "workspace_test", null, false)).toBe(false);
  });

  test("disables actions on a cold load and while an operation runs", () => {
    expect(workflowToolbarDisabled(false, "workspace_test", null, false)).toBe(true);
    expect(workflowToolbarDisabled(true, "workspace_test", "run", false)).toBe(true);
    expect(workflowToolbarDisabled(true, "", null, false)).toBe(true);
  });
});

describe("workflow graph toolbar run and stop visibility", () => {
  test("shows run only for blank and draft views", () => {
    expect(workflowToolbarShowsRunButton(null)).toBe(true);
    expect(workflowToolbarShowsStopButton(null)).toBe(false);

    const draft = workflowProjection({ viewMode: "draft" });
    expect(workflowToolbarShowsRunButton(draft)).toBe(true);
    expect(workflowToolbarShowsRunButton(draft, workflowRunSummary({ status: "running" }))).toBe(
      false,
    );
    expect(workflowToolbarShowsStopButton(draft)).toBe(false);
  });

  test("shows stop only for running run projections", () => {
    const running = workflowProjection({ executionStatus: "running", viewMode: "run" });
    expect(workflowToolbarShowsRunButton(running)).toBe(false);
    expect(workflowToolbarShowsStopButton(running)).toBe(true);

    for (const executionStatus of ["completed", "failed", "stopped", "cancelled"] as const) {
      const terminal = workflowProjection({ executionStatus, viewMode: "run" });
      expect(workflowToolbarShowsRunButton(terminal)).toBe(false);
      expect(workflowToolbarShowsStopButton(terminal)).toBe(false);
    }
  });

  test("hides run and stop for version snapshots", () => {
    const projection = workflowProjection({
      executionId: "",
      executionStatus: null,
      viewMode: "version",
    });

    expect(workflowToolbarShowsRunButton(projection)).toBe(false);
    expect(workflowToolbarShowsStopButton(projection)).toBe(false);
  });
});

describe("workflow graph toolbar run summaries", () => {
  test("derives the active run from backend summaries", () => {
    const completed = workflowRunSummary({ id: "workflow_execution_completed" });
    const running = workflowRunSummary({
      id: "workflow_execution_running",
      status: "running",
    });

    expect(workflowActiveRunSummary([completed, running])).toBe(running);
  });

  test("pins the active run above terminal history", () => {
    const newestTerminal = workflowRunSummary({ id: "workflow_execution_newest" });
    const active = workflowRunSummary({ id: "workflow_execution_active", status: "running" });
    const olderTerminal = workflowRunSummary({ id: "workflow_execution_older" });

    expect(
      workflowRunSelectorItems([newestTerminal, active, olderTerminal]).map(({ id }) => id),
    ).toEqual([
      "workflow_execution_active",
      "workflow_execution_newest",
      "workflow_execution_older",
    ]);
  });
});

describe("workflow graph toolbar draft action", () => {
  test("names the action as switching back to editable draft", () => {
    const running = workflowProjection({ executionStatus: "running", viewMode: "run" });
    const completed = workflowProjection({ executionStatus: "completed", viewMode: "run" });

    expect(workflowDraftButtonLabel(running)).toBe("Edit Draft");
    expect(workflowDraftButtonTitle(running)).toBe(
      "Switch to the editable draft. This does not stop the running workflow.",
    );
    expect(workflowDraftButtonLabel(completed)).toBe("Edit Draft");
    expect(workflowDraftButtonTitle(completed)).toBe("Switch to the editable draft.");
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
    draftUpdatedAt: "2026-06-08T12:10:00Z",
    edges: [],
    layout: { nodes: [] },
    nodes: [],
    schemaVersion: 1,
    terminalReason: null,
    updatedAt: "2026-06-08T12:15:00Z",
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

function workflowRunSummary(
  overrides: Partial<WorkflowExecutionSummary> = {},
): WorkflowExecutionSummary {
  return {
    completedAt: "2026-06-08T12:20:00Z",
    definitionId: "workflow_definition",
    definitionVersionId: "workflow_version_003",
    definitionVersionNumber: 3,
    id: "workflow_execution_run",
    lastEventOrdinal: 7,
    startedAt: "2026-06-08T12:00:00Z",
    status: "completed",
    terminalReason: "end_reached",
    updatedAt: "2026-06-08T12:20:00Z",
    workspaceId: "workspace_test",
    ...overrides,
  };
}
