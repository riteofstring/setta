import type {
  SemanticActivityInterval,
  SemanticActivitySummary,
  SemanticGraph,
  SemanticGraphChangeEvent,
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
    let refreshQueued = false;
    let refreshRunning = false;
    let refreshRequested = false;

    if (selectedWorkspaceId === "") {
      setState(semanticGraphNoWorkspaceState(""));
      return;
    }

    setState(semanticGraphLoadingState(selectedWorkspaceId));

    const refresh = async (reason: "initial" | "notification") => {
      if (refreshRunning) {
        refreshRequested = true;
        return;
      }
      refreshRunning = true;
      try {
        do {
          refreshRequested = false;
          try {
            const snapshot = await loadSemanticGraphSnapshot(selectedWorkspaceId);
            if (!disposed) {
              setState({
                activitiesByNodeId: snapshot.activitiesByNodeId,
                error: "",
                graph: snapshot.graph,
                loading: false,
                noWorkspace: false,
                ready: true,
                workspaceId: selectedWorkspaceId,
              });
            }
          } catch (error: unknown) {
            console.error(
              reason === "initial"
                ? "Failed to load semantic graph"
                : "Failed to refresh semantic graph",
              error,
            );
            if (!disposed) {
              setState((current) =>
                current.workspaceId === selectedWorkspaceId
                  ? {
                      ...current,
                      error: errorMessage(error),
                      loading: false,
                      noWorkspace: false,
                      ready: false,
                      workspaceId: selectedWorkspaceId,
                    }
                  : current,
              );
            }
          }
        } while (refreshRequested && !disposed);
      } finally {
        refreshRunning = false;
      }
    };

    const scheduleRefresh = () => {
      if (refreshQueued) {
        return;
      }
      refreshQueued = true;
      queueMicrotask(() => {
        refreshQueued = false;
        void refresh("notification");
      });
    };

    void refresh("initial");
    const unsubscribe = window.setta.semanticGraph.onEvent((event) => {
      if (semanticGraphChangeAffectsWorkspaceGraphState(event, selectedWorkspaceId)) {
        scheduleRefresh();
      }
    });

    return () => {
      disposed = true;
      unsubscribe();
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

export function semanticGraphChangeAffectsWorkspaceGraphState(
  event: SemanticGraphChangeEvent,
  workspaceId: string,
) {
  return event.workspaceId === workspaceId && event.changedAreas.length > 0;
}

async function loadSemanticGraphSnapshot(workspaceId: string) {
  const [graph, activitySummary] = await Promise.all([
    window.setta.semanticGraph.read({ workspaceId }),
    window.setta.semanticGraph.readActivitySummary({
      recentLimit: semanticGraphActivityLimit,
      workspaceId,
    }),
  ]);
  return {
    activitiesByNodeId: semanticGraphActivitySummaryMap(activitySummary),
    graph,
  };
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

function semanticGraphLoadingState(workspaceId: string): SemanticGraphState {
  return {
    activitiesByNodeId: new Map(),
    error: "",
    graph: null,
    loading: true,
    noWorkspace: false,
    ready: false,
    workspaceId,
  };
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
