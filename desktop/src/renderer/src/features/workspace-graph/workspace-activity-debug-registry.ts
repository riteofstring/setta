export interface WorkspaceActivityDebugSnapshot {
  activityDeltasDuringCameraMovement: number;
  backendReadCameraMovementCheckCount: number;
  backendReadsDuringCameraMovement: number;
  deltasApplied: number;
  graphSceneReplacementCheckCount: number;
  graphSceneReplacementTouched: boolean;
  lastError: string | null;
  lastRevision: number;
  lastSequence: number;
  lastStreamId: string;
  markerCreatedCount: number;
  markerRemovedCount: number;
  markerRetainedCount: number;
  markerUpdatedCount: number;
  recordsRetained: number;
  retainedLimit: number;
  revisionGapReloads: number;
  snapshotsLoaded: number;
  workspaceId: string;
}

export interface WorkspaceActivityDebugApi {
  __surfaces: Map<string, () => WorkspaceActivityDebugSnapshot>;
  getSnapshot: (surfaceId?: string) => WorkspaceActivityDebugSnapshot;
}

export function registerWorkspaceActivityDebugSurface(
  surfaceId: string,
  getSnapshot: () => WorkspaceActivityDebugSnapshot,
): () => void {
  const api = ensureWorkspaceActivityDebugApi();
  api.__surfaces.set(surfaceId, getSnapshot);
  return () => {
    if (api.__surfaces.get(surfaceId) === getSnapshot) {
      api.__surfaces.delete(surfaceId);
    }
    if (api.__surfaces.size === 0 && window.__settaWorkspaceActivityDebug === api) {
      delete window.__settaWorkspaceActivityDebug;
    }
  };
}

function ensureWorkspaceActivityDebugApi(): WorkspaceActivityDebugApi {
  const existing = window.__settaWorkspaceActivityDebug;
  if (existing?.__surfaces instanceof Map) {
    return existing;
  }
  const surfaces = new Map<string, () => WorkspaceActivityDebugSnapshot>();
  const api: WorkspaceActivityDebugApi = {
    __surfaces: surfaces,
    getSnapshot(surfaceId?: string) {
      return resolveWorkspaceActivityDebugSurface(surfaces, surfaceId)();
    },
  };
  window.__settaWorkspaceActivityDebug = api;
  return api;
}

function resolveWorkspaceActivityDebugSurface(
  surfaces: Map<string, () => WorkspaceActivityDebugSnapshot>,
  surfaceId?: string,
): () => WorkspaceActivityDebugSnapshot {
  if (surfaceId) {
    const getSnapshot = surfaces.get(surfaceId);
    if (!getSnapshot) {
      throw new Error(`Workspace activity debug surface is not registered: ${surfaceId}`);
    }
    return getSnapshot;
  }
  const first = surfaces.values().next();
  if (first.done) {
    throw new Error("No workspace activity debug surfaces are registered");
  }
  return first.value;
}
