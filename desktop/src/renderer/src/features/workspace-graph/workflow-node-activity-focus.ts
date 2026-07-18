import type {
  WorkflowNodeActivityFocus,
  WorkflowNodeActivityFocusInput,
} from "../../stores/workflow-editor-store";
import type { WorkflowGraphActivityChipTarget } from "./pixi-renderer";

// Maps a clicked activity chip to a workflow node details focus request. Marker chips carry a typed
// detail ref and deep-link to the matching detail row; collapsed (+N) chips have no single detail
// ref, so they only open the owning node's details pane without highlighting a row.
export function activityFocusFromChip(
  chip: WorkflowGraphActivityChipTarget,
): WorkflowNodeActivityFocusInput | null {
  if (chip.type !== "marker" || chip.detailRef === null) {
    return null;
  }
  return {
    activityId: chip.activityId,
    approvalId: chip.detailRef.approvalId,
    detailKind: chip.detailRef.kind,
    runItemId: chip.detailRef.runItemId,
    workflowEventId: chip.detailRef.workflowEventId,
  };
}

// The DOM `data-activity-focus-id` a focus request targets. Returns "" when the typed reference for
// the focus kind is unavailable, so the details pane simply opens without highlighting a row.
export function workflowActivityFocusElementId(
  focus: Pick<
    WorkflowNodeActivityFocus,
    "approvalId" | "detailKind" | "runItemId" | "workflowEventId"
  >,
): string {
  switch (focus.detailKind) {
    case "chat_run_item":
      return focus.runItemId === "" ? "" : workflowActivityFocusRunItemId(focus.runItemId);
    case "workflow_event":
      return focus.workflowEventId === ""
        ? ""
        : workflowActivityFocusWorkflowEventId(focus.workflowEventId);
    case "approval":
      return focus.approvalId === "" ? "" : workflowActivityFocusApprovalId(focus.approvalId);
    case "workflow_node":
      return "";
    default:
      return "";
  }
}

// Keep the run-item element id format in sync with the shared chat run-activity row, which stamps
// `run-item:${item.id}` on a deep-linked row.
function workflowActivityFocusRunItemId(runItemId: string): string {
  return `run-item:${runItemId}`;
}

export function workflowActivityFocusWorkflowEventId(workflowEventId: string): string {
  return `workflow-event:${workflowEventId}`;
}

export function workflowActivityFocusApprovalId(approvalId: string): string {
  return `approval:${approvalId}`;
}
