import { describe, expect, test } from "vitest";

import { createWorkflowGraphSceneVisitCounters } from "./pixi-renderer-scene-visit-counters";

describe("workflow graph scene visit counters", () => {
  test("samples required CPU visit counters for camera frames", () => {
    let time = 10;
    const counters = createWorkflowGraphSceneVisitCounters({ now: () => time });

    counters.beginFrame({ frameCount: 1 });
    counters.markCameraFrame();
    counters.record("settaOwnedLayerVisits", 2);
    counters.record("graphObjectsConsidered", 12);
    counters.record("cullCandidatesChecked", 8);
    counters.record("displayObjectsTraversed", 3);
    counters.record("labelsConsidered", 5);
    counters.record("boundsCalculations", 9);
    time = 26;
    counters.endFrame({ frameMs: 16 });

    const snapshot = counters.snapshot({ visibleRenderableCount: 32 });
    expect(snapshot.requiredCounterNames).toEqual([
      "settaOwnedLayerVisits",
      "graphObjectsConsidered",
      "cullCandidatesChecked",
      "displayObjectsTraversed",
      "labelsConsidered",
      "boundsCalculations",
    ]);
    expect(snapshot.cameraFrameSceneVisitStats.sampleCount).toBe(1);
    expect(snapshot.cameraFrameSceneVisitStats.counters.totalSceneVisits.p95).toBe(39);
    expect(snapshot.cameraFrameSceneVisitStats.counters.graphObjectsConsidered.p95).toBe(12);
    expect(snapshot.visibleRenderableCount).toBe(32);
  });

  test("ignores non-camera frames in camera-frame samples", () => {
    const counters = createWorkflowGraphSceneVisitCounters({ now: () => 1 });

    counters.beginFrame({ frameCount: 1 });
    counters.record("graphObjectsConsidered", 4);
    counters.endFrame({ frameMs: 16 });

    const snapshot = counters.snapshot();
    expect(snapshot.cameraFrameSceneVisitStats.sampleCount).toBe(0);
    expect(snapshot.totals.graphObjectsConsidered).toBe(4);
  });
});
