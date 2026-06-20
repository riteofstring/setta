import type {
  SemanticActivityInterval,
  SemanticActivitySummary,
  SemanticGraph,
  SemanticGraphChangeEvent,
  SemanticLayoutPosition,
} from "@generated/backend";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useWorkspaceStore } from "../../stores/workspace-store";
import {
  createSemanticRuntimeStore,
  semanticGraphChangeHasRuntimeUpdate,
  type SemanticRuntimeStore,
} from "./semantic-runtime-store";

interface SemanticGraphState {
  activitiesByNodeId: Map<string, SemanticActivityInterval[]>;
  error: string;
  graph: SemanticGraph | null;
  loading: boolean;
  noWorkspace: boolean;
  ready: boolean;
  workspaceId: string;
}

export interface SemanticGraphRefreshRequest {
  activity: boolean;
  graph: boolean;
  workingSet: boolean;
}

const semanticGraphActivityLimit = 3;
const semanticWorkingSetLimit = 40;
const emptyRefreshRequest: SemanticGraphRefreshRequest = {
  activity: false,
  graph: false,
  workingSet: false,
};
const fullRefreshRequest: SemanticGraphRefreshRequest = {
  activity: true,
  graph: true,
  workingSet: false,
};

export function useSemanticGraphState() {
  const selectedWorkspaceId = useWorkspaceStore(
    (state) => state.session?.selectedWorkspaceId ?? "",
  );
  const runtimeStore = useMemo<SemanticRuntimeStore | null>(
    () =>
      selectedWorkspaceId === ""
        ? null
        : createSemanticRuntimeStore({
            loadSnapshot: () => loadSemanticRuntimeSnapshot(selectedWorkspaceId),
            subscribeEvents: (listener) => window.setta.semanticGraph.onEvent(listener),
            workspaceId: selectedWorkspaceId,
          }),
    [selectedWorkspaceId],
  );
  const [state, setState] = useState<SemanticGraphState>(() => semanticGraphNoWorkspaceState(""));

  useEffect(() => {
    if (runtimeStore === null) {
      return;
    }
    runtimeStore.start();
    return () => {
      runtimeStore.destroy();
    };
  }, [runtimeStore]);

  useEffect(() => {
    let disposed = false;
    let refreshQueued = false;
    let refreshRunning = false;
    let refreshRequested = false;
    let scheduledRefresh = emptyRefreshRequest;

    if (selectedWorkspaceId === "") {
      setState(semanticGraphNoWorkspaceState(""));
      return;
    }

    setState(semanticGraphLoadingState(selectedWorkspaceId));

    const refresh = async (
      reason: "initial" | "notification",
      request: SemanticGraphRefreshRequest,
    ) => {
      if (refreshRunning) {
        scheduledRefresh = mergeSemanticGraphRefreshRequests(scheduledRefresh, request);
        refreshRequested = true;
        return;
      }
      refreshRunning = true;
      let nextRequest = request;
      try {
        do {
          refreshRequested = false;
          try {
            const snapshot = await loadSemanticGraphSnapshot(selectedWorkspaceId, nextRequest);
            if (disposed) {
              continue;
            }
            setState((current) => ({
              activitiesByNodeId: snapshot.activitiesByNodeId ?? current.activitiesByNodeId,
              error: "",
              graph: snapshot.graph ?? current.graph,
              loading: false,
              noWorkspace: false,
              ready: true,
              workspaceId: selectedWorkspaceId,
            }));
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
          nextRequest = scheduledRefresh;
          scheduledRefresh = emptyRefreshRequest;
        } while (refreshRequested && !disposed);
      } finally {
        refreshRunning = false;
      }
    };

    const scheduleRefresh = (request: SemanticGraphRefreshRequest) => {
      scheduledRefresh = mergeSemanticGraphRefreshRequests(scheduledRefresh, request);
      if (refreshRunning) {
        refreshRequested = true;
        return;
      }
      if (refreshQueued) {
        return;
      }
      refreshQueued = true;
      queueMicrotask(() => {
        refreshQueued = false;
        const request = scheduledRefresh;
        scheduledRefresh = emptyRefreshRequest;
        if (semanticGraphRefreshRequestIsEmpty(request)) {
          return;
        }
        void refresh("notification", request);
      });
    };

    void refresh("initial", fullRefreshRequest);
    const unsubscribe = window.setta.semanticGraph.onEvent((event) => {
      const request = semanticGraphRefreshRequestForChange(event, selectedWorkspaceId);
      if (request !== null) {
        scheduleRefresh(request);
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
    runtimeStore,
  };
}

export function semanticGraphActivitySummaryMap(summary: SemanticActivitySummary) {
  const entries = summary.targets.map((target): [string, SemanticActivityInterval[]] => [
    target.targetEntityId,
    dedupeSemanticActivity([...target.currentActivity, ...target.recentActivity]),
  ]);
  return new Map(entries);
}

export function semanticGraphRefreshRequestForChange(
  event: SemanticGraphChangeEvent,
  workspaceId: string,
): SemanticGraphRefreshRequest | null {
  if (event.workspaceId !== workspaceId) {
    return null;
  }
  const graph = event.changedAreas.some((area) => area === "graph" || area === "layout");
  const activity = graph || event.changedAreas.includes("activity");
  const workingSet = false;
  if (!graph && !activity && !workingSet) {
    return null;
  }
  return { activity, graph, workingSet };
}

export function semanticGraphChangeAffectsWorkspaceGraphState(
  event: SemanticGraphChangeEvent,
  workspaceId: string,
) {
  return (
    semanticGraphRefreshRequestForChange(event, workspaceId) !== null ||
    (event.workspaceId === workspaceId && semanticGraphChangeHasRuntimeUpdate(event))
  );
}

async function loadSemanticGraphSnapshot(
  workspaceId: string,
  request: SemanticGraphRefreshRequest,
) {
  if (request.graph) {
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
  const activitySummary = request.activity
    ? await window.setta.semanticGraph.readActivitySummary({
        recentLimit: semanticGraphActivityLimit,
        workspaceId,
      })
    : null;
  if (activitySummary !== null) {
    return {
      activitiesByNodeId: semanticGraphActivitySummaryMap(activitySummary),
    };
  }
  return {};
}

function loadSemanticRuntimeSnapshot(workspaceId: string) {
  return window.setta.semanticGraph.readRuntimeSnapshot({
    chatRunId: "",
    limit: semanticWorkingSetLimit,
    workflowExecutionId: "",
    workspaceId,
  });
}

function mergeSemanticGraphRefreshRequests(
  left: SemanticGraphRefreshRequest,
  right: SemanticGraphRefreshRequest,
): SemanticGraphRefreshRequest {
  return {
    activity: left.activity || right.activity,
    graph: left.graph || right.graph,
    workingSet: left.workingSet || right.workingSet,
  };
}

function semanticGraphRefreshRequestIsEmpty(request: SemanticGraphRefreshRequest) {
  return !request.activity && !request.graph && !request.workingSet;
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
