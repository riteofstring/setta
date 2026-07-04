export function registerWorkflowNodeDetailsDebugSurface(
  surfaceId: string,
  openNodeDetails: (nodeId: string) => boolean,
) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const api = ensureWorkflowNodeDetailsDebugApi();
  api.__surfaces.set(surfaceId, openNodeDetails);
  return () => {
    if (api.__surfaces.get(surfaceId) === openNodeDetails) {
      api.__surfaces.delete(surfaceId);
    }
    if (api.__surfaces.size === 0 && window.__settaWorkflowNodeDetailsDebug === api) {
      delete window.__settaWorkflowNodeDetailsDebug;
    }
  };
}

function ensureWorkflowNodeDetailsDebugApi(): NonNullable<
  Window["__settaWorkflowNodeDetailsDebug"]
> {
  const existing = window.__settaWorkflowNodeDetailsDebug;
  if (existing?.__surfaces instanceof Map) {
    return existing;
  }
  const surfaces = new Map<string, (nodeId: string) => boolean>();
  const api: NonNullable<Window["__settaWorkflowNodeDetailsDebug"]> = {
    __surfaces: surfaces,
    getSurfaceIds() {
      return [...surfaces.keys()];
    },
    openNodeDetails(surfaceId: string, nodeId: string) {
      return surfaces.get(surfaceId)?.(nodeId) ?? false;
    },
  };
  window.__settaWorkflowNodeDetailsDebug = api;
  return api;
}
