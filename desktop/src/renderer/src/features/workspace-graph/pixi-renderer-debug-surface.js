import { registerWorkflowGraphDebugSurface } from "./pixi-renderer-debug-registry";

export function registerWorkflowGraphDebugSurfaceIfEnabled({
  debugEnabled,
  fitToGraph,
  debugSurfaceId,
  getSnapshot,
}) {
  if (!debugEnabled) {
    return null;
  }
  return registerWorkflowGraphDebugSurface(debugSurfaceId, { fitToGraph, getSnapshot });
}
