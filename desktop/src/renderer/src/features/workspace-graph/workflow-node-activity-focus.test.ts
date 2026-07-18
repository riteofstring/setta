import { describe, expect, test } from "vitest";

import type { WorkflowGraphActivityChipTarget } from "./pixi-renderer";
import {
  activityFocusFromChip,
  workflowActivityFocusElementId,
} from "./workflow-node-activity-focus";

describe("activityFocusFromChip", () => {
  test("maps a command chip detail ref to a run item focus", () => {
    expect(
      activityFocusFromChip(
        markerChip({
          approvalId: "",
          kind: "chat_run_item",
          runItemId: "run_item_a",
          workflowEventId: "",
        }),
      ),
    ).toEqual({
      activityId: "activity_a",
      approvalId: "",
      detailKind: "chat_run_item",
      runItemId: "run_item_a",
      workflowEventId: "",
    });
  });

  test("maps a workflow-status chip detail ref to a workflow event focus", () => {
    expect(
      activityFocusFromChip(
        markerChip({
          approvalId: "",
          kind: "workflow_event",
          runItemId: "",
          workflowEventId: "event_a",
        }),
      ),
    ).toMatchObject({ detailKind: "workflow_event", workflowEventId: "event_a" });
  });

  test("maps an approval chip detail ref to an approval focus", () => {
    expect(
      activityFocusFromChip(
        markerChip({
          approvalId: "approval_a",
          kind: "approval",
          runItemId: "",
          workflowEventId: "",
        }),
      ),
    ).toMatchObject({ approvalId: "approval_a", detailKind: "approval" });
  });

  test("returns null for collapsed chips that have no single detail ref", () => {
    expect(
      activityFocusFromChip({
        activityId: "",
        detailRef: null,
        markerId: "",
        nodeId: "work",
        type: "collapsed",
      }),
    ).toBeNull();
  });
});

describe("workflowActivityFocusElementId", () => {
  test("builds the deep-link element id per detail kind", () => {
    expect(
      workflowActivityFocusElementId({
        approvalId: "",
        detailKind: "chat_run_item",
        runItemId: "run_item_a",
        workflowEventId: "",
      }),
    ).toBe("run-item:run_item_a");
    expect(
      workflowActivityFocusElementId({
        approvalId: "",
        detailKind: "workflow_event",
        runItemId: "",
        workflowEventId: "event_a",
      }),
    ).toBe("workflow-event:event_a");
    expect(
      workflowActivityFocusElementId({
        approvalId: "approval_a",
        detailKind: "approval",
        runItemId: "",
        workflowEventId: "",
      }),
    ).toBe("approval:approval_a");
  });

  test("returns an empty id when the typed reference is unavailable", () => {
    expect(
      workflowActivityFocusElementId({
        approvalId: "",
        detailKind: "chat_run_item",
        runItemId: "",
        workflowEventId: "",
      }),
    ).toBe("");
    expect(
      workflowActivityFocusElementId({
        approvalId: "",
        detailKind: "workflow_node",
        runItemId: "",
        workflowEventId: "",
      }),
    ).toBe("");
  });
});

function markerChip(
  detailRef: NonNullable<WorkflowGraphActivityChipTarget["detailRef"]>,
): WorkflowGraphActivityChipTarget {
  return {
    activityId: "activity_a",
    detailRef,
    markerId: "marker_a",
    nodeId: "work",
    type: "marker",
  };
}
