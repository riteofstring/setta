import type { SyntheticWorkflowGraphOptions } from "./workflow-graph-camera-scope";

export function workflowSyntheticGraphForSurface(
  syntheticGraphFallback: SyntheticWorkflowGraphOptions | undefined,
) {
  return window.setta.app.flags.workflowGraphSyntheticGraph ?? syntheticGraphFallback ?? null;
}

export function workflowGraphStateForSurface({
  hasDisplayedProjection,
  semanticGraphError,
  semanticGraphLoading,
  syntheticGraph,
  workflowProjectionHasNoWorkspace,
  workflowProjectionLoadError,
  workflowProjectionLoading,
}: {
  hasDisplayedProjection: boolean;
  semanticGraphError: string;
  semanticGraphLoading: boolean;
  syntheticGraph: SyntheticWorkflowGraphOptions;
  workflowProjectionHasNoWorkspace: boolean;
  workflowProjectionLoadError: string;
  workflowProjectionLoading: boolean;
}) {
  if (syntheticGraph !== null) {
    return {
      loadingProjection: false,
      noWorkspace: false,
      workflowProjectionError: "",
    };
  }
  return {
    // Only surface the full loading state when the canvas has nothing to show yet. While a new
    // target loads behind an existing projection the previous graph keeps rendering, so a
    // loading overlay there would be the destructive blank frame this slice removes.
    loadingProjection:
      (workflowProjectionLoading && !hasDisplayedProjection) || semanticGraphLoading,
    noWorkspace: workflowProjectionHasNoWorkspace,
    workflowProjectionError: [workflowProjectionLoadError, semanticGraphError]
      .filter(Boolean)
      .join("\n"),
  };
}
