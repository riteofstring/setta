import type {
  SemanticActivityInterval,
  SemanticActivitySummary,
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
      const [graph, activitySummary] = await Promise.all([
        window.setta.semanticGraph.read({ workspaceId: selectedWorkspaceId }),
        window.setta.semanticGraph.readActivitySummary({
          recentLimit: semanticGraphActivityLimit,
          workspaceId: selectedWorkspaceId,
        }),
      ]);
      const activitiesByNodeId = semanticGraphActivitySummaryMap(activitySummary);
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

export function semanticGraphActivitySummaryMap(summary: SemanticActivitySummary) {
  const entries = summary.targets.map((target): [string, SemanticActivityInterval[]] => [
    target.targetEntityId,
    dedupeSemanticActivity([...target.currentActivity, ...target.recentActivity]),
  ]);
  return new Map(entries);
}

function dedupeSemanticActivity(activity: SemanticActivityInterval[]) {
  const seen = new Set<string>();
  const result: SemanticActivityInterval[] = [];
  for (const interval of activity) {
    if (seen.has(interval.id)) {
      continue;
    }
    seen.add(interval.id);
    result.push(interval);
  }
  return result;
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
