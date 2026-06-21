/* global window */

export function registerWorkflowGraphDebugSurface(surfaceId, getSnapshot) {
  const api = ensureWorkflowGraphDebugApi();
  api.__renderers.set(surfaceId, getSnapshot);
  return () => {
    if (api.__renderers.get(surfaceId) === getSnapshot) {
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
      return withWorkspaceActivityDebug(
        resolveWorkflowGraphDebugSurface(renderers, surfaceId)(options),
      );
    },
    getSnapshots() {
      return Object.fromEntries(
        [...renderers.entries()].map(([surfaceId, getSnapshot]) => [
          surfaceId,
          withWorkspaceActivityDebug(getSnapshot()),
        ]),
      );
    },
    getSurfaceIds() {
      return [...renderers.keys()];
    },
  };
  window.__settaWorkflowGraphDebug = api;
  return api;
}

function resolveWorkflowGraphDebugSurface(renderers, surfaceId) {
  if (surfaceId) {
    const getSnapshot = renderers.get(surfaceId);
    if (!getSnapshot) {
      throw new Error(`Workflow graph debug surface is not registered: ${surfaceId}`);
    }
    return getSnapshot;
  }
  const first = renderers.values().next();
  if (first.done) {
    throw new Error("No Workflow graph debug surfaces are registered");
  }
  return first.value;
}

function withWorkspaceActivityDebug(snapshot) {
  return {
    ...snapshot,
    activity: workspaceActivityDebugSnapshot(snapshot.surfaceId),
  };
}

function workspaceActivityDebugSnapshot(surfaceId) {
  try {
    return (
      window.__settaWorkspaceActivityDebug?.getSnapshot(surfaceId) ??
      emptyWorkspaceActivityDebugSnapshot()
    );
  } catch {
    return emptyWorkspaceActivityDebugSnapshot();
  }
}

function emptyWorkspaceActivityDebugSnapshot() {
  return {
    activityDeltasDuringCameraMovement: 0,
    backendReadCameraMovementCheckCount: 0,
    backendReadsDuringCameraMovement: 0,
    deltasApplied: 0,
    graphSceneReplacementCheckCount: 0,
    graphSceneReplacementTouched: false,
    lastError: null,
    lastRevision: 0,
    lastSequence: 0,
    lastStreamId: "",
    markerCreatedCount: 0,
    markerRemovedCount: 0,
    markerRetainedCount: 0,
    markerUpdatedCount: 0,
    markers: [],
    recordsRetained: 0,
    retainedLimit: 0,
    revisionGapReloads: 0,
    snapshotsLoaded: 0,
    workspaceId: "",
  };
}
