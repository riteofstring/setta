import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  panZoomPerformanceReportMarkdown,
  parsePanZoomPerformanceArtifacts,
} from "./workflow-graph-phase0-performance-report.mjs";

test("parsePanZoomPerformanceArtifacts rebuilds a diagnostic report from raw artifacts", async () => {
  const artifactRoot = await mkdtemp(join(tmpdir(), "setta-pan-zoom-report-"));
  try {
    const runMetadata = fixtureRunMetadata();
    const before = fixtureSnapshot({
      deferredGraphApplyCount: 0,
      deferredGraphUpdateCount: 0,
      frameCount: 10,
      graphUpdateCount: 0,
      nodeDragUpdateCount: 0,
    });
    const after = fixtureSnapshot({
      cameraDependentSyncFrameCount: 2,
      cameraMovingLabelTransformCount: 3,
      cameraMovingLabelTransformFrameCount: 2,
      cameraSettleRestoreFrameCount: 1,
      deferredGraphApplyCount: 1,
      deferredGraphUpdateCount: 2,
      frameCount: 20,
      graphUpdateCount: 1,
      nodeDragUpdateCount: 1,
      wheelInputEventCount: 1,
      wheelInputGestureCount: 1,
      wheelPanUpdateCount: 1,
    });

    await writeJson(join(artifactRoot, "summary.json"), {
      artifactDir: artifactRoot,
      final: compactSnapshot(after.snapshot),
      initial: compactSnapshot(before.snapshot),
      nodeCount: 1,
      runMetadata,
      scenario: "normal",
      status: "passed",
      syntheticScene: "phase0-normal",
    });
    await writeJson(join(artifactRoot, "run-metadata.json"), runMetadata);
    await writeJson(join(artifactRoot, "pan-zoom-debug-snapshots.json"), [before, after]);
    await writeJson(join(artifactRoot, "pan-zoom-input-samples.json"), [
      {
        at: "2026-06-19T12:00:00.000Z",
        kind: "node-drag",
        renderDeltas: { nodeDragUpdateCount: 1 },
      },
      {
        at: "2026-06-19T12:00:00.100Z",
        kind: "wheel",
        renderDeltas: { graphUpdateCount: 0 },
      },
    ]);
    await writeJson(join(artifactRoot, "pan-zoom-performance-observer.json"), {
      eventTimings: [{ duration: 18 }],
      longTasks: [{ duration: 42 }],
      mutationCountsByOwnerAndSource: {},
      observerErrors: [],
      paneMutations: [],
      reactCommits: [],
      supportedEntryTypes: ["mark", "measure", "longtask", "event"],
      userTimings: [
        inputStartMark({ cameraInput: false, kind: "node-drag", token: 1 }),
        inputEndMark({ durationMs: 8, token: 1 }),
        inputStartMark({ cameraInput: true, kind: "wheel", token: 2 }),
        inputEndMark({ durationMs: 6, token: 2 }),
      ],
    });
    await writeJson(join(artifactRoot, "pan-zoom-cdp-trace-summary.json"), {
      eventCount: 1,
      topCompleteEvents: [{ category: "toplevel", durationMs: 42, name: "RunTask" }],
      topLevelTasks: [{ category: "toplevel", durationMs: 42, name: "RunTask" }],
    });

    const report = await parsePanZoomPerformanceArtifacts({
      artifactRoot,
      phase: "phase7",
    });
    const [scenario] = report.scenarios;
    const markdown = panZoomPerformanceReportMarkdown(report);

    assert.equal(report.source, "artifact-parser");
    assert.equal(report.status, "passed");
    assert.equal(scenario.diagnostics.inputInteractions.cameraCount, 1);
    assert.equal(scenario.diagnostics.frameTiming.p99, 20);
    assert.equal(scenario.diagnostics.deferredWorkByLane["graph-update"], 2);
    assert.match(markdown, /## Pan\/Zoom Diagnosis/);
    assert.match(markdown, /wheel#2/);
    assert.match(markdown, /DOM mutations by owner\/source: none/);
    assert.match(markdown, /draw calls: not instrumented/);
  } finally {
    await rm(artifactRoot, { force: true, recursive: true });
  }
});

function fixtureSnapshot(renderOverrides) {
  const render = {
    averageFrameMs: 12,
    cameraDependentSyncFrameCount: 0,
    cameraFastPathViolationCount: 0,
    cameraMovingLabelDeferredFrameCount: 0,
    cameraMovingLabelHiddenFrameCount: 0,
    cameraMovingLabelSyncedFrameCount: 0,
    cameraMovingLabelTransformCount: 0,
    cameraMovingLabelTransformFrameCount: 0,
    cameraMovingSyncFrameCount: 0,
    cameraSettleRestoreFrameCount: 0,
    cameraSettledSyncFrameCount: 0,
    cameraUpdateCount: 0,
    canvasCreationCount: 1,
    deferredGraphApplyCount: 0,
    deferredGraphUpdateCount: 0,
    frameCount: 0,
    graphUpdateCount: 0,
    labelSyncCount: 0,
    lastVisibleMaterializedNodeCount: 1,
    materializedLabelCount: 1,
    materializedNodeCount: 1,
    nodeDragUpdateCount: 0,
    p95FrameMs: 16,
    pointerPanUpdateCount: 0,
    recentFrameMs: [10, 12, 16, 20],
    rendererDestroyCount: 0,
    rendererInstanceId: 7,
    sceneVisitCounters: fixtureSceneVisitCounters(),
    timingBuckets: {
      "pixi-render": { count: 1, totalMs: 1, worstMs: 1 },
      "static-glow-redraw": { count: 0, totalMs: 0, worstMs: 0 },
    },
    totalDisplayObjectCount: 20,
    wheelInput: {
      samples: [
        {
          cameraChanged: true,
          cameraUpdateDurationMs: 0.2,
          eventTimestampDeltaMs: 4,
          eventTimestampToCameraUpdateMs: 4.2,
          eventTimestampToFirstPixiRenderAfterCameraMs: 12,
          eventToCameraUpdateMs: 0.2,
          eventToFirstPixiRenderAfterCameraMs: 8,
          handlerDurationMs: 0.3,
        },
      ],
    },
    wheelInputEventCount: 0,
    wheelInputGestureCount: 0,
    wheelPanUpdateCount: 0,
    wheelZoomUpdateCount: 1,
    worstFrameMs: 20,
    ...renderOverrides,
  };
  return {
    at: "2026-06-19T12:00:00.000Z",
    debugRegistry: {
      activeRendererCount: 1,
      canvasCountForSurface: 1,
      focusedSurfaceRegistered: true,
      surfaceIds: ["surface-1"],
    },
    phase: "sample",
    renderDeltas: {},
    snapshot: {
      camera: { x: 0, y: 0, zoom: 1 },
      graph: {
        edgeCount: 0,
        nodeCount: 1,
        nodes: [{ id: "node-1", layer: "workflow" }],
        workflow: {},
      },
      render,
      surfaceId: "surface-1",
    },
  };
}

function fixtureSceneVisitCounters() {
  const counter = { max: 8, p50: 4, p95: 8, sampleCount: 2 };
  return {
    cameraFrameSceneVisitStats: {
      counters: {
        boundsCalculations: counter,
        cullCandidatesChecked: counter,
        displayObjectsTraversed: counter,
        graphObjectsConsidered: counter,
        labelsConsidered: counter,
        settaOwnedLayerVisits: counter,
        totalSceneVisits: counter,
      },
      sampleCount: 2,
    },
    visibleRenderableCount: 20,
  };
}

function fixtureRunMetadata() {
  return {
    benchmark: {
      workload: {
        randomSeed: "fixture-seed",
        repetitionCount: 1,
        syntheticScene: "phase0-normal",
        warmUpCount: 1,
      },
    },
    build: {
      mode: "test",
      recordingEnabled: true,
      timingThresholds: "report-only",
      workflowGraphDebugEnabled: true,
    },
    display: {
      devicePixelRatio: 2,
      refreshRateEstimateHz: 60,
      viewport: { height: 900, width: 1440 },
    },
  };
}

function inputStartMark({ cameraInput, kind, token }) {
  return {
    detail: {
      cameraInput,
      causalSource: cameraInput ? `camera:${kind}` : `interaction:${kind}`,
      kind,
      startedAt: token * 10,
      token,
    },
    entryType: "mark",
    name: "setta.workflow-graph.input.start",
    startTime: token * 10,
  };
}

function inputEndMark({ durationMs, token }) {
  return {
    detail: {
      durationMs,
      endedAt: token * 10 + durationMs,
      token,
    },
    entryType: "mark",
    name: "setta.workflow-graph.input.end",
    startTime: token * 10 + durationMs,
  };
}

function compactSnapshot(snapshot) {
  return {
    camera: snapshot.camera,
    graph: {
      edgeCount: snapshot.graph.edgeCount,
      nodeCount: snapshot.graph.nodeCount,
      semanticNodeCount: 0,
      workflowNodeCount: 1,
    },
    render: snapshot.render,
  };
}

async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}
