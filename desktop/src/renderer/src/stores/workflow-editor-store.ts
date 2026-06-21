import type {
  WorkflowGraphEdge,
  WorkflowGraphNodeStatus,
  WorkflowGraphViewMode,
  WorkflowNodeKind,
} from "@generated/backend";
import { create } from "zustand";

import type { WorkflowGraphRuntimeIndicator } from "../features/workspace-graph/pixi-renderer";
import type { WorkspaceTrajectoryNodeDetails } from "../features/workspace-graph/workspace-trajectory-store";

export interface WorkflowNodeDetailsTarget {
  definitionId: string;
  definitionName: string;
  definitionVersionId: string;
  definitionVersionNumber: number;
  editable: boolean;
  executionId: string;
  focusedRunItemId?: string;
  nodeId: string;
  nodeKind: WorkflowNodeKind | "";
  nodeLabel: string;
  nodeStatus: WorkflowGraphNodeStatus | "";
  projectionIncomingEdges: WorkflowGraphEdge[];
  projectionOutgoingEdges: WorkflowGraphEdge[];
  runtime?: WorkflowGraphRuntimeIndicator | null;
  trajectory?: WorkspaceTrajectoryNodeDetails | null;
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
  definitionChangeSequence: number;
  notifyWorkflowDefinitionChanged: (workspaceId: string, definitionId: string) => void;
  selectedNodeTarget: WorkflowNodeDetailsTarget | null;
  selectedWorkflowSettingsTarget: WorkflowSettingsTarget | null;
  setSelectedNodeTarget: (target: WorkflowNodeDetailsTarget | null) => void;
  setSelectedWorkflowSettingsTarget: (target: WorkflowSettingsTarget | null) => void;
}

export const useWorkflowEditorStore = create<WorkflowEditorStore>((set) => ({
  definitionChangeSequence: 0,
  notifyWorkflowDefinitionChanged: () => {
    set((state) => ({
      definitionChangeSequence: state.definitionChangeSequence + 1,
    }));
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
