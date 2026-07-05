export interface WorkflowDefinitionChangedDetail {
  definitionId: string;
  workspaceId: string;
}

export const workflowDefinitionChangedEventName = "setta:workflow-definition-changed";

export function dispatchWorkflowDefinitionChanged(detail: WorkflowDefinitionChangedDetail) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(workflowDefinitionChangedEventName, {
      detail,
    }),
  );
}

export function workflowDefinitionChangedDetail(
  event: Event,
): WorkflowDefinitionChangedDetail | null {
  if (!(event instanceof CustomEvent)) {
    return null;
  }
  const detail = event.detail;
  if (
    !detail ||
    typeof detail.workspaceId !== "string" ||
    typeof detail.definitionId !== "string"
  ) {
    return null;
  }
  return {
    definitionId: detail.definitionId,
    workspaceId: detail.workspaceId,
  };
}
