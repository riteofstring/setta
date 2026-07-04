import type {
  WorkflowGraphEdge,
  WorkflowGraphNodeStatus,
  WorkflowGraphViewMode,
  WorkflowNodeKind,
  WorkspaceActivityDetailKind,
} from "@generated/backend";
import { create } from "zustand";

import { dispatchWorkflowDefinitionChanged } from "./workflow-definition-invalidation";

export interface WorkflowNodeDetailsTarget {
  definitionId: string;
  definitionName: string;
  definitionVersionId: string;
  definitionVersionNumber: number;
  executionId: string;
  nodeId: string;
  nodeKind: WorkflowNodeKind;
  nodeLabel: string;
  nodeStatus: WorkflowGraphNodeStatus;
  projectionIncomingEdges: WorkflowGraphEdge[];
  projectionOutgoingEdges: WorkflowGraphEdge[];
  versionMismatch: boolean;
  viewMode: WorkflowGraphViewMode;
  workspaceId: string;
}

// Deep-link request from a clicked activity chip into the workflow node details pane. detailKind
// selects which row to highlight; the matching id field carries the typed reference. requestId is a
// monotonic nonce so re-clicking the same chip re-runs the highlight/scroll effect.
export interface WorkflowNodeActivityFocus {
  activityId: string;
  approvalId: string;
  detailKind: WorkspaceActivityDetailKind;
  requestId: number;
  runItemId: string;
  workflowEventId: string;
}

export type WorkflowNodeActivityFocusInput = Omit<WorkflowNodeActivityFocus, "requestId">;

export interface WorkflowSettingsTarget {
  definitionDescription: string;
  definitionId: string;
  definitionName: string;
  editable: boolean;
  viewMode: WorkflowGraphViewMode | "blank";
  workspaceId: string;
}

interface WorkflowEditorStore {
  activityFocusRequestSeq: number;
  notifyWorkflowDefinitionChanged: (workspaceId: string, definitionId: string) => void;
  selectedNodeActivityFocus: WorkflowNodeActivityFocus | null;
  selectedNodeTarget: WorkflowNodeDetailsTarget | null;
  selectedWorkflowSettingsTarget: WorkflowSettingsTarget | null;
  setSelectedNodeTarget: (
    target: WorkflowNodeDetailsTarget | null,
    activityFocus?: WorkflowNodeActivityFocusInput | null,
  ) => void;
  setSelectedWorkflowSettingsTarget: (target: WorkflowSettingsTarget | null) => void;
}

export const useWorkflowEditorStore = create<WorkflowEditorStore>((set) => ({
  activityFocusRequestSeq: 0,
  notifyWorkflowDefinitionChanged: (workspaceId, definitionId) => {
    dispatchWorkflowDefinitionChanged({ definitionId, workspaceId });
  },
  selectedNodeActivityFocus: null,
  selectedNodeTarget: null,
  selectedWorkflowSettingsTarget: null,
  setSelectedNodeTarget: (target, activityFocus = null) => {
    set((state) => {
      if (activityFocus === null) {
        return { selectedNodeActivityFocus: null, selectedNodeTarget: target };
      }
      const requestId = state.activityFocusRequestSeq + 1;
      return {
        activityFocusRequestSeq: requestId,
        selectedNodeActivityFocus: { ...activityFocus, requestId },
        selectedNodeTarget: target,
      };
    });
  },
  setSelectedWorkflowSettingsTarget: (target) => {
    set({ selectedWorkflowSettingsTarget: target });
  },
}));
