/* global window */

export function registerWorkflowGraphDebugSurface(surfaceId, surface) {
  const api = ensureWorkflowGraphDebugApi();
  api.__renderers.set(surfaceId, normalizeDebugSurface(surface));
  return () => {
    if (api.__renderers.get(surfaceId)?.source === surface) {
      api.__renderers.delete(surfaceId);
    }
    if (api.__renderers.size === 0 && window.__settaWorkflowGraphDebug === api) {
      delete window.__settaWorkflowGraphDebug;
    }
  };
}

function ensureWorkflowGraphDebugApi() {
  const existing = window.__settaWorkflowGraphDebug;
  if (existing?.__renderers instanceof Map) {
    return existing;
  }

  const renderers = new Map();
  const api = {
    __renderers: renderers,
    getSnapshot(surfaceId, options) {
      return resolveWorkflowGraphDebugSurface(renderers, surfaceId).getSnapshot(options);
    },
    getSnapshots() {
      return Object.fromEntries(
        [...renderers.entries()].map(([surfaceId, surface]) => [surfaceId, surface.getSnapshot()]),
      );
    },
    getSurfaceIds() {
      return [...renderers.keys()];
    },
    fitToGraph(surfaceId, options) {
      const surface = resolveWorkflowGraphDebugSurface(renderers, surfaceId);
      if (!surface.fitToGraph) {
        throw new Error(`Workflow graph debug surface cannot fit camera: ${surfaceId}`);
      }
      return surface.fitToGraph(options);
    },
  };
  window.__settaWorkflowGraphDebug = api;
  return api;
}

function normalizeDebugSurface(surface) {
  if (typeof surface === "function") {
    return {
      fitToGraph: null,
      getSnapshot: surface,
      source: surface,
    };
  }
  return {
    fitToGraph: surface.fitToGraph ?? null,
    getSnapshot: surface.getSnapshot,
    source: surface,
  };
}

function resolveWorkflowGraphDebugSurface(renderers, surfaceId) {
  if (surfaceId) {
    const surface = renderers.get(surfaceId);
    if (!surface) {
      throw new Error(`Workflow graph debug surface is not registered: ${surfaceId}`);
    }
    return surface;
  }
  const first = renderers.values().next();
  if (first.done) {
    throw new Error("No Workflow graph debug surfaces are registered");
  }
  return first.value;
}
