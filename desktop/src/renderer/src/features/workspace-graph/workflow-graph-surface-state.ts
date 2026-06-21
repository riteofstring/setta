import type { SyntheticWorkflowGraphOptions } from "./workflow-graph-camera-scope";

export function workflowGraphAnimationSettingsForSurface() {
  const prefersReducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  return {
    animationEnabled: window.setta.app.flags.workflowGraphAnimationEnabled,
    reduceMotion: window.setta.app.flags.workflowGraphReduceMotion || prefersReducedMotion,
  };
}

export function workflowSyntheticGraphForSurface(
  syntheticGraphFallback: SyntheticWorkflowGraphOptions | undefined,
) {
  return window.setta.app.flags.workflowGraphSyntheticGraph ?? syntheticGraphFallback ?? null;
}

export function workflowGraphStateForSurface({
  semanticGraphError,
  semanticGraphLoading,
  syntheticGraph,
  workflowProjectionHasNoWorkspace,
  workflowProjectionLoadError,
  workflowProjectionLoading,
}: {
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
    loadingProjection: workflowProjectionLoading || semanticGraphLoading,
    noWorkspace: workflowProjectionHasNoWorkspace,
    workflowProjectionError: [workflowProjectionLoadError, semanticGraphError]
      .filter(Boolean)
      .join("\n"),
  };
}
