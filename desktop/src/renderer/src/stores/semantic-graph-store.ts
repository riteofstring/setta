import type { SemanticNodeKind } from "@generated/backend";
import { create } from "zustand";

interface SemanticNodeDetailsTarget {
  nodeId: string;
  nodeKind: SemanticNodeKind;
  nodeLabel: string;
  workspaceId: string;
}

interface SemanticGraphStore {
  selectedNodeTarget: SemanticNodeDetailsTarget | null;
  setSelectedNodeTarget: (target: SemanticNodeDetailsTarget | null) => void;
}

export const useSemanticGraphStore = create<SemanticGraphStore>((set) => ({
  selectedNodeTarget: null,
  setSelectedNodeTarget: (target) => {
    set({ selectedNodeTarget: target });
  },
}));
