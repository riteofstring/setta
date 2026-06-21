import type {
  WorkflowGraphEdge,
  WorkflowGraphNodeStatus,
  WorkflowGraphViewMode,
  WorkflowNodeKind,
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
  nodeKind: WorkflowNodeKind | "";
  nodeLabel: string;
  nodeStatus: WorkflowGraphNodeStatus | "";
  projectionIncomingEdges: WorkflowGraphEdge[];
  projectionOutgoingEdges: WorkflowGraphEdge[];
  versionMismatch: boolean;
  viewMode: WorkflowGraphViewMode;
  workspaceId: string;
}

export interface WorkflowSettingsTarget {
  definitionDescription: string;
  definitionId: string;
  definitionName: string;
  editable: boolean;
  viewMode: WorkflowGraphViewMode | "blank";
  workspaceId: string;
}

interface WorkflowEditorStore {
  notifyWorkflowDefinitionChanged: (workspaceId: string, definitionId: string) => void;
  selectedNodeTarget: WorkflowNodeDetailsTarget | null;
  selectedWorkflowSettingsTarget: WorkflowSettingsTarget | null;
  setSelectedNodeTarget: (target: WorkflowNodeDetailsTarget | null) => void;
  setSelectedWorkflowSettingsTarget: (target: WorkflowSettingsTarget | null) => void;
}

export const useWorkflowEditorStore = create<WorkflowEditorStore>((set) => ({
  notifyWorkflowDefinitionChanged: (workspaceId, definitionId) => {
    dispatchWorkflowDefinitionChanged({ definitionId, workspaceId });
  },
  selectedNodeTarget: null,
  selectedWorkflowSettingsTarget: null,
  setSelectedNodeTarget: (target) => {
    set({ selectedNodeTarget: target });
  },
  setSelectedWorkflowSettingsTarget: (target) => {
    set({ selectedWorkflowSettingsTarget: target });
  },
}));
