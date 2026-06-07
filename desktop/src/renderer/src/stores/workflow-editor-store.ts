import type {
  WorkflowGraphEdge,
  WorkflowGraphNodeStatus,
  WorkflowNodeKind,
} from "@generated/backend";
import { create } from "zustand";

export interface WorkflowNodeDetailsTarget {
  definitionId: string;
  definitionName: string;
  definitionVersionId: string;
  executionId: string;
  nodeId: string;
  nodeKind: WorkflowNodeKind | "";
  nodeLabel: string;
  nodeStatus: WorkflowGraphNodeStatus | "";
  projectionIncomingEdges: WorkflowGraphEdge[];
  projectionOutgoingEdges: WorkflowGraphEdge[];
  workspaceId: string;
}

interface WorkflowEditorStore {
  definitionChangeSequence: number;
  notifyWorkflowDefinitionChanged: (workspaceId: string, definitionId: string) => void;
  selectedNodeTarget: WorkflowNodeDetailsTarget | null;
  setSelectedNodeTarget: (target: WorkflowNodeDetailsTarget | null) => void;
}

export const useWorkflowEditorStore = create<WorkflowEditorStore>((set) => ({
  definitionChangeSequence: 0,
  notifyWorkflowDefinitionChanged: () => {
    set((state) => ({
      definitionChangeSequence: state.definitionChangeSequence + 1,
    }));
  },
  selectedNodeTarget: null,
  setSelectedNodeTarget: (target) => {
    set({ selectedNodeTarget: target });
  },
}));
