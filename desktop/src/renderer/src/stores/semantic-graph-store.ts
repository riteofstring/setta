import type { SemanticNodeKind } from "@generated/backend";
import { create } from "zustand";

interface SemanticNodeDetailsTarget {
  nodeId: string;
  nodeKind: SemanticNodeKind;
  nodeLabel: string;
  workspaceId: string;
}

interface SemanticGraphStore {
  resetRuntimeState: () => void;
  selectedNodeTarget: SemanticNodeDetailsTarget | null;
  setSelectedNodeTarget: (target: SemanticNodeDetailsTarget | null) => void;
}

export const useSemanticGraphStore = create<SemanticGraphStore>((set) => ({
  resetRuntimeState: () => {
    set({ selectedNodeTarget: null });
  },
  selectedNodeTarget: null,
  setSelectedNodeTarget: (target) => {
    set({ selectedNodeTarget: target });
  },
}));
