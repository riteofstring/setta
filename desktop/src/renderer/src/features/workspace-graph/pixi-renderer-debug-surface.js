import { registerWorkflowGraphDebugSurface } from "./pixi-renderer-debug-registry";

export function registerWorkflowGraphDebugSurfaceIfEnabled({
  debugEnabled,
  debugSurfaceId,
  getSnapshot,
}) {
  if (!debugEnabled) {
    return null;
  }
  return registerWorkflowGraphDebugSurface(debugSurfaceId, getSnapshot);
}
