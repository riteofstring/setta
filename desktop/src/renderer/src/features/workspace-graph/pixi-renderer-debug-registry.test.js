import { beforeEach, describe, expect, test } from "vitest";

import { registerWorkflowGraphDebugSurface } from "./pixi-renderer-debug-registry";

describe("workflow graph debug registry", () => {
  beforeEach(() => {
    globalThis.window = {};
  });

  test("merges workspace activity counters into graph debug snapshots", () => {
    const getActivitySnapshot = (surfaceId) => ({
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
      markers: [
        {
          activityId: "activity_command",
          anchorKind: "workflow_node",
          id: "workspace-activity:node:work:command",
          kind: "command",
          nodeId: "work",
        },
      ],
      recordsRetained: 2,
      retainedLimit: 200,
      revisionGapReloads: 1,
      snapshotsLoaded: 1,
      suppressedUnanchoredActivityCount: 1,
      suppressedUnanchoredActivityIds: ["activity_execution"],
      workspaceId: surfaceId === "surface_activity" ? "workspace_api" : "",
    });
    globalThis.window.__settaWorkspaceActivityDebug = {
      __surfaces: new Map(),
      getSnapshot: getActivitySnapshot,
      tryGetSnapshot: getActivitySnapshot,
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
        markers: [
          {
            activityId: "activity_command",
            anchorKind: "workflow_node",
            id: "workspace-activity:node:work:command",
            kind: "command",
            nodeId: "work",
          },
        ],
        recordsRetained: 2,
        revisionGapReloads: 1,
        snapshotsLoaded: 1,
        suppressedUnanchoredActivityCount: 1,
        suppressedUnanchoredActivityIds: ["activity_execution"],
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
      markers: [],
      recordsRetained: 0,
      revisionGapReloads: 0,
      snapshotsLoaded: 0,
      suppressedUnanchoredActivityCount: 0,
      suppressedUnanchoredActivityIds: [],
    });
  });

  test("returns null for missing debug surfaces without swallowing snapshot failures", () => {
    registerWorkflowGraphDebugSurface("surface_broken", () => {
      throw new Error("debug snapshot failed");
    });

    expect(globalThis.window.__settaWorkflowGraphDebug.tryGetSnapshot("surface_missing")).toBe(
      null,
    );
    expect(() =>
      globalThis.window.__settaWorkflowGraphDebug.tryGetSnapshot("surface_broken"),
    ).toThrow("debug snapshot failed");
    expect(() =>
      globalThis.window.__settaWorkflowGraphDebug.getSnapshot("surface_missing"),
    ).toThrow("Workflow graph debug surface is not registered: surface_missing");
  });
});
