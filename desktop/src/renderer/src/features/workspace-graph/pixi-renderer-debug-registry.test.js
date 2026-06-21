import { beforeEach, describe, expect, test } from "vitest";

import { registerWorkflowGraphDebugSurface } from "./pixi-renderer-debug-registry";

describe("workflow graph debug registry", () => {
  beforeEach(() => {
    globalThis.window = {};
  });

  test("merges workspace activity counters into graph debug snapshots", () => {
    globalThis.window.__settaWorkspaceActivityDebug = {
      __surfaces: new Map(),
      getSnapshot: (surfaceId) => ({
        activityDeltasDuringCameraMovement: 2,
        backendReadCameraMovementCheckCount: 1,
        backendReadsDuringCameraMovement: 0,
        deltasApplied: 3,
        graphSceneReplacementCheckCount: 3,
        graphSceneReplacementTouched: false,
        lastError: null,
        lastRevision: 7,
        lastSequence: 9,
        lastStreamId: "workspace_activity_stream",
        markerCreatedCount: 0,
        markerRemovedCount: 0,
        markerRetainedCount: 0,
        markerUpdatedCount: 0,
        recordsRetained: 2,
        retainedLimit: 200,
        revisionGapReloads: 1,
        snapshotsLoaded: 1,
        workspaceId: surfaceId === "surface_activity" ? "workspace_api" : "",
      }),
    };
    const unregister = registerWorkflowGraphDebugSurface("surface_activity", () => ({
      surfaceId: "surface_activity",
    }));

    expect(
      globalThis.window.__settaWorkflowGraphDebug.getSnapshot("surface_activity"),
    ).toMatchObject({
      activity: {
        activityDeltasDuringCameraMovement: 2,
        deltasApplied: 3,
        graphSceneReplacementCheckCount: 3,
        graphSceneReplacementTouched: false,
        markerCreatedCount: 0,
        recordsRetained: 2,
        revisionGapReloads: 1,
        snapshotsLoaded: 1,
        workspaceId: "workspace_api",
      },
      surfaceId: "surface_activity",
    });

    unregister();
  });

  test("uses zero activity counters before activity state registers", () => {
    registerWorkflowGraphDebugSurface("surface_graph", () => ({ surfaceId: "surface_graph" }));

    expect(
      globalThis.window.__settaWorkflowGraphDebug.getSnapshot("surface_graph").activity,
    ).toMatchObject({
      backendReadsDuringCameraMovement: 0,
      activityDeltasDuringCameraMovement: 0,
      backendReadCameraMovementCheckCount: 0,
      deltasApplied: 0,
      graphSceneReplacementCheckCount: 0,
      graphSceneReplacementTouched: false,
      markerCreatedCount: 0,
      markerRemovedCount: 0,
      markerRetainedCount: 0,
      markerUpdatedCount: 0,
      recordsRetained: 0,
      revisionGapReloads: 0,
      snapshotsLoaded: 0,
    });
  });
});
