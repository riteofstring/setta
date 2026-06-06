/* global window */

export function registerPixiWorkspaceDebugSurface(surfaceId, getSnapshot) {
  const api = ensurePixiWorkspaceDebugApi();
  api.__renderers.set(surfaceId, getSnapshot);
  return () => {
    if (api.__renderers.get(surfaceId) === getSnapshot) {
      api.__renderers.delete(surfaceId);
    }
    if (api.__renderers.size === 0 && window.__settaPixiWorkspaceDebug === api) {
      delete window.__settaPixiWorkspaceDebug;
    }
  };
}

function ensurePixiWorkspaceDebugApi() {
  const existing = window.__settaPixiWorkspaceDebug;
  if (existing?.__renderers instanceof Map) {
    return existing;
  }

  const renderers = new Map();
  const api = {
    __renderers: renderers,
    getSnapshot(surfaceId) {
      return resolvePixiWorkspaceDebugSurface(renderers, surfaceId)();
    },
    getSnapshots() {
      return Object.fromEntries(
        [...renderers.entries()].map(([surfaceId, getSnapshot]) => [surfaceId, getSnapshot()]),
      );
    },
    getSurfaceIds() {
      return [...renderers.keys()];
    },
  };
  window.__settaPixiWorkspaceDebug = api;
  return api;
}

function resolvePixiWorkspaceDebugSurface(renderers, surfaceId) {
  if (surfaceId) {
    const getSnapshot = renderers.get(surfaceId);
    if (!getSnapshot) {
      throw new Error(`Pixi workspace debug surface is not registered: ${surfaceId}`);
    }
    return getSnapshot;
  }
  const first = renderers.values().next();
  if (first.done) {
    throw new Error("No Pixi workspace debug surfaces are registered");
  }
  return first.value;
}
