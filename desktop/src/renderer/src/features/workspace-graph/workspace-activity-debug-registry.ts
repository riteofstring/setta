import type { WorkspaceActivityMarker } from "./workspace-activity-markers";

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
  markers: WorkspaceActivityMarker[];
  recordsRetained: number;
  retainedLimit: number;
  revisionGapReloads: number;
  snapshotsLoaded: number;
  suppressedUnanchoredActivityCount: number;
  suppressedUnanchoredActivityIds: string[];
  workspaceId: string;
}

export interface WorkspaceActivityDebugApi {
  __surfaces: Map<string, () => WorkspaceActivityDebugSnapshot>;
  getSnapshot: (surfaceId?: string) => WorkspaceActivityDebugSnapshot;
  tryGetSnapshot: (surfaceId?: string) => WorkspaceActivityDebugSnapshot | null;
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
    existing.tryGetSnapshot ??= (surfaceId?: string) =>
      maybeResolveWorkspaceActivityDebugSurface(existing.__surfaces, surfaceId)?.() ?? null;
    return existing;
  }
  const surfaces = new Map<string, () => WorkspaceActivityDebugSnapshot>();
  const api: WorkspaceActivityDebugApi = {
    __surfaces: surfaces,
    getSnapshot(surfaceId?: string) {
      return resolveWorkspaceActivityDebugSurface(surfaces, surfaceId)();
    },
    tryGetSnapshot(surfaceId?: string) {
      return maybeResolveWorkspaceActivityDebugSurface(surfaces, surfaceId)?.() ?? null;
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

function maybeResolveWorkspaceActivityDebugSurface(
  surfaces: Map<string, () => WorkspaceActivityDebugSnapshot>,
  surfaceId?: string,
): (() => WorkspaceActivityDebugSnapshot) | undefined {
  if (surfaceId) {
    return surfaces.get(surfaceId);
  }
  const first = surfaces.values().next();
  return first.done ? undefined : first.value;
}
