import type {
  SemanticActivityInterval,
  SemanticGraph,
  SemanticLayoutPosition,
} from "@generated/backend";
import { useCallback, useEffect, useState } from "react";

import { useWorkspaceStore } from "../../stores/workspace-store";

interface SemanticGraphState {
  activitiesByNodeId: Map<string, SemanticActivityInterval[]>;
  error: string;
  graph: SemanticGraph | null;
  loading: boolean;
  noWorkspace: boolean;
  ready: boolean;
  workspaceId: string;
}

const semanticGraphActivityLimit = 3;

export function useSemanticGraphState() {
  const selectedWorkspaceId = useWorkspaceStore(
    (state) => state.session?.selectedWorkspaceId ?? "",
  );
  const [state, setState] = useState<SemanticGraphState>(() => semanticGraphNoWorkspaceState(""));

  useEffect(() => {
    let disposed = false;
    if (selectedWorkspaceId === "") {
      setState(semanticGraphNoWorkspaceState(""));
      return;
    }
    setState({
      activitiesByNodeId: new Map(),
      error: "",
      graph: null,
      loading: true,
      noWorkspace: false,
      ready: false,
      workspaceId: selectedWorkspaceId,
    });
    const load = async () => {
      const graph = await window.setta.semanticGraph.read({ workspaceId: selectedWorkspaceId });
      const activitiesByNodeId = await loadSemanticGraphActivity(graph);
      if (!disposed) {
        setState({
          activitiesByNodeId,
          error: "",
          graph,
          loading: false,
          noWorkspace: false,
          ready: true,
          workspaceId: selectedWorkspaceId,
        });
      }
    };
    void load().catch((error: unknown) => {
      console.error("Failed to load semantic graph", error);
      if (!disposed) {
        setState({
          activitiesByNodeId: new Map(),
          error: errorMessage(error),
          graph: null,
          loading: false,
          noWorkspace: false,
          ready: false,
          workspaceId: selectedWorkspaceId,
        });
      }
    });
    return () => {
      disposed = true;
    };
  }, [selectedWorkspaceId]);

  const replaceSemanticLayoutPositions = useCallback((positions: SemanticLayoutPosition[]) => {
    setState((current) =>
      current.graph === null
        ? current
        : {
            ...current,
            graph: {
              ...current.graph,
              layoutPositions: positions,
            },
          },
    );
  }, []);

  return {
    ...state,
    replaceSemanticLayoutPositions,
  };
}

async function loadSemanticGraphActivity(graph: SemanticGraph) {
  const entries = await Promise.all(
    graph.nodes.map(async (node): Promise<[string, SemanticActivityInterval[]]> => {
      const response = await window.setta.semanticGraph.listActivity({
        limit: semanticGraphActivityLimit,
        targetEntityId: node.id,
        workspaceId: graph.workspaceId,
      });
      return [node.id, response.activity];
    }),
  );
  return new Map(entries);
}

function semanticGraphNoWorkspaceState(workspaceId: string): SemanticGraphState {
  return {
    activitiesByNodeId: new Map(),
    error: "",
    graph: null,
    loading: false,
    noWorkspace: workspaceId === "",
    ready: true,
    workspaceId,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Semantic graph load failed";
}
