import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

import { captureScreenshotClip, writeJson } from "./electron-cdp-harness.mjs";
import { pagePointForCanvasPoint } from "./workflow-graph-layout-helpers.mjs";

const traceCategories = [
  "benchmark",
  "blink.user_timing",
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "loading",
  "toplevel",
];

const renderDeltaCounters = [
  "cameraDependentSyncFrameCount",
  "cameraMovingLabelHiddenFrameCount",
  "cameraMovingSyncFrameCount",
  "cameraSettleLabelSyncCount",
  "cameraSettleRestoreFrameCount",
  "cameraSettledSyncFrameCount",
  "cameraUpdateCount",
  "frameCount",
  "labelSyncCount",
  "nodeDragUpdateCount",
  "pointerPanUpdateCount",
  "spatialIndexQueryCount",
  "wheelInputEventCount",
  "wheelInputGestureCount",
  "wheelInputTailCandidateEventCount",
  "wheelPanUpdateCount",
  "wheelZoomUpdateCount",
];

export async function recordWorkflowGraphPanZoomDiagnostics({
  artifactDir,
  client,
  interaction,
  name,
  sampleIntervalMs = 250,
  surfaceId,
}) {
  await installPerformanceTimelineRecorder(client);
  const trace = await startCdpTrace(client, artifactDir, name);
  const inputSamples = [];
  const snapshots = await sampleWorkflowGraphDuringInteraction({
    client,
    interaction: () => interaction({ inputSamples }),
    sampleIntervalMs,
    surfaceId,
  });
  const traceResult = await trace.stop();
  const performanceTimeline = await readPerformanceTimelineRecorder(client);
  await disconnectPerformanceTimelineRecorder(client);

  const snapshotsPath = join(artifactDir, `${name}-debug-snapshots.json`);
  const inputSamplesPath = join(artifactDir, `${name}-input-samples.json`);
  const performancePath = join(artifactDir, `${name}-performance-observer.json`);
  await writeJson(snapshotsPath, snapshots);
  await writeJson(inputSamplesPath, inputSamples);
  await writeJson(performancePath, performanceTimeline);
  return {
    inputSamplesPath,
    metrics: summarizeWorkflowGraphPerformanceDiagnostics({
      inputSamples,
      performanceTimeline,
      snapshots,
    }),
    performancePath,
    snapshotsPath,
    tracePath: traceResult.path,
  };
}

export async function dispatchRecordedWorkflowGraphMouseMove(
  client,
  surfaceId,
  { kind = "pointer-hover", modifiers = 0, x, y },
  samples,
) {
  await recordInputSample(
    client,
    surfaceId,
    {
      canvasPoint: { x, y },
      kind,
      modifiers,
    },
    async ({ pagePoint }) => {
      await client.call("Input.dispatchMouseEvent", {
        button: "none",
        modifiers,
        type: "mouseMoved",
        x: pagePoint.x,
        y: pagePoint.y,
      });
    },
    samples,
  );
}

export async function dispatchRecordedWorkflowGraphMouseClick(
  client,
  surfaceId,
  { kind = "pointer-select", modifiers = 0, x, y },
  samples,
) {
  await recordInputSample(
    client,
    surfaceId,
    {
      canvasPoint: { x, y },
      kind,
      modifiers,
    },
    async ({ pagePoint }) => {
      await client.call("Input.dispatchMouseEvent", {
        button: "none",
        modifiers,
        type: "mouseMoved",
        x: pagePoint.x,
        y: pagePoint.y,
      });
      await client.call("Input.dispatchMouseEvent", {
        button: "left",
        buttons: 1,
        clickCount: 1,
        modifiers,
        type: "mousePressed",
        x: pagePoint.x,
        y: pagePoint.y,
      });
      await client.call("Input.dispatchMouseEvent", {
        button: "left",
        buttons: 0,
        clickCount: 1,
        modifiers,
        type: "mouseReleased",
        x: pagePoint.x,
        y: pagePoint.y,
      });
    },
    samples,
  );
}

export async function dispatchRecordedWorkflowGraphWheel(
  client,
  surfaceId,
  { deltaX = 0, deltaY = 0, modifiers = 0, x, y },
  samples,
) {
  await recordInputSample(
    client,
    surfaceId,
    {
      canvasPoint: { x, y },
      deltaX,
      deltaY,
      kind: "wheel",
      modifiers,
    },
    async ({ pagePoint }) => {
      await client.call("Input.dispatchMouseEvent", {
        deltaX,
        deltaY,
        modifiers,
        type: "mouseWheel",
        x: pagePoint.x,
        y: pagePoint.y,
      });
    },
    samples,
  );
}

export async function dispatchRecordedWorkflowGraphWheelBurst(
  client,
  surfaceId,
  { events, modifiers = 0, x, y },
  samples,
) {
  const pagePoint = await pagePointForCanvasPoint(client, surfaceId, { x, y });
  const targetCanvas = await client.driver("workflowGraphCanvasRect", { surfaceId });
  const startedAt = await client.evaluate("performance.now()");
  const dispatched = [];
  const pendingDispatches = [];
  for (const [index, event] of events.entries()) {
    queueRecordedWheelDispatch({
      client,
      dispatched,
      event,
      index,
      modifiers,
      pagePoint,
      pendingDispatches,
    });
    await delayAfterRecordedWheelEvent(event);
  }
  await Promise.all(pendingDispatches);
  const completedAt = await client.evaluate("performance.now()");
  samples.push({
    at: new Date().toISOString(),
    canvasPoint: { x, y },
    completedAt,
    dispatched,
    durationMs: completedAt - startedAt,
    kind: "wheel-burst",
    pagePoint,
    startedAt,
    surfaceId,
    targetCanvas,
  });
}

function queueRecordedWheelDispatch({
  client,
  dispatched,
  event,
  index,
  modifiers,
  pagePoint,
  pendingDispatches,
}) {
  const deltaX = event.deltaX ?? 0;
  const deltaY = event.deltaY ?? 0;
  const effectiveModifiers = event.modifiers ?? modifiers;
  const harnessSentAtMs = performance.now();
  pendingDispatches.push(
    client.call("Input.dispatchMouseEvent", {
      deltaX,
      deltaY,
      modifiers: effectiveModifiers,
      type: "mouseWheel",
      x: pagePoint.x,
      y: pagePoint.y,
    }),
  );
  dispatched.push({
    deltaX,
    deltaY,
    harnessSentAtMs,
    index,
    modifiers: effectiveModifiers,
    phase: event.phase ?? "",
  });
}

async function delayAfterRecordedWheelEvent(event) {
  if (event.delayMs > 0) {
    await delay(event.delayMs);
  }
}

export async function dispatchRecordedWorkflowGraphMouseDrag(
  client,
  surfaceId,
  {
    downKind = "pointer-down",
    from,
    holdMs = 16,
    modifiers = 0,
    moveKind = "pointer-pan",
    startKind = "pointer-move",
    steps = 12,
    to,
    upKind = "pointer-up",
  },
  samples,
) {
  await recordInputSample(
    client,
    surfaceId,
    {
      canvasPoint: from,
      kind: startKind,
      modifiers,
    },
    async ({ pagePoint }) => {
      await client.call("Input.dispatchMouseEvent", {
        button: "none",
        modifiers,
        type: "mouseMoved",
        x: pagePoint.x,
        y: pagePoint.y,
      });
    },
    samples,
  );
  await recordInputSample(
    client,
    surfaceId,
    {
      canvasPoint: from,
      kind: downKind,
      modifiers,
    },
    async ({ pagePoint }) => {
      await client.call("Input.dispatchMouseEvent", {
        button: "left",
        buttons: 1,
        clickCount: 1,
        modifiers,
        type: "mousePressed",
        x: pagePoint.x,
        y: pagePoint.y,
      });
    },
    samples,
  );
  await delay(holdMs);
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    const canvasPoint = {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };
    await recordInputSample(
      client,
      surfaceId,
      {
        canvasPoint,
        kind: moveKind,
        modifiers,
      },
      async ({ pagePoint }) => {
        await client.call("Input.dispatchMouseEvent", {
          button: "left",
          buttons: 1,
          modifiers,
          type: "mouseMoved",
          x: pagePoint.x,
          y: pagePoint.y,
        });
      },
      samples,
    );
    await delay(16);
  }
  await recordInputSample(
    client,
    surfaceId,
    {
      canvasPoint: to,
      kind: upKind,
      modifiers,
    },
    async ({ pagePoint }) => {
      await client.call("Input.dispatchMouseEvent", {
        button: "left",
        buttons: 0,
        clickCount: 1,
        modifiers,
        type: "mouseReleased",
        x: pagePoint.x,
        y: pagePoint.y,
      });
    },
    samples,
  );
}

export async function captureWorkflowGraphFitContactSheet({
  artifactDir,
  client,
  durationMs = 2500,
  frameIntervalMs = 250,
  name,
  surfaceId,
}) {
  await client.driver("workflowGraphFitToView", { surfaceId });
  const rect = await client.driver("workflowGraphCanvasRect", { surfaceId });
  const frames = [];
  const frameCount = Math.max(1, Math.ceil(durationMs / frameIntervalMs));
  const frameDir = join(artifactDir, `${name}-fit-contact-frames`);
  await mkdir(frameDir, { recursive: true });
  for (let index = 0; index < frameCount; index += 1) {
    const fileName = `frame-${String(index + 1).padStart(2, "0")}.png`;
    const path = join(frameDir, fileName);
    await captureScreenshotClip(client, path, {
      height: rect.height,
      scale: 1,
      width: rect.width,
      x: rect.left,
      y: rect.top,
    });
    frames.push({
      elapsedMs: index * frameIntervalMs,
      path,
    });
    await delay(frameIntervalMs);
  }
  const htmlPath = join(artifactDir, `${name}-fit-contact-sheet.html`);
  await writeContactSheet(htmlPath, frames);
  return {
    frames,
    htmlPath,
  };
}

export async function getWorkflowGraphDebugSnapshot(client, surfaceId, includeVisual = false) {
  return client.driver("workflowGraphDebugSnapshot", { includeVisual, surfaceId });
}

async function sampleWorkflowGraphDuringInteraction({
  client,
  interaction,
  sampleIntervalMs,
  surfaceId,
}) {
  const samples = [];
  let previous = null;
  let running = true;
  const appendSnapshot = async (phase) => {
    const snapshot = await getWorkflowGraphDebugSnapshot(client, surfaceId, false);
    const sample = {
      at: new Date().toISOString(),
      phase,
      renderDeltas: previous === null ? emptyRenderDeltas() : renderDeltas(previous, snapshot),
      snapshot: compactWorkflowGraphSnapshot(snapshot),
    };
    samples.push(sample);
    previous = snapshot;
  };

  await appendSnapshot("before");
  const sampler = (async () => {
    while (running) {
      await delay(sampleIntervalMs);
      if (running) {
        await appendSnapshot("during");
      }
    }
  })();
  try {
    await interaction();
  } finally {
    running = false;
    await sampler;
  }
  await appendSnapshot("after");
  return samples;
}

function compactWorkflowGraphSnapshot(snapshot) {
  return {
    camera: snapshot.camera,
    canvas: snapshot.canvas,
    graph: {
      edgeCount: snapshot.graph.edgeCount,
      nodeCount: snapshot.graph.nodeCount,
      workflow: snapshot.graph.workflow,
    },
    interaction: snapshot.interaction,
    render: snapshot.render,
    surfaceId: snapshot.surfaceId,
  };
}

async function recordInputSample(client, surfaceId, event, dispatch, samples) {
  const before = await getWorkflowGraphDebugSnapshot(client, surfaceId, false);
  const targetCanvas = await client.driver("workflowGraphCanvasRect", { surfaceId });
  const pagePoint = await pagePointForCanvasPoint(client, surfaceId, event.canvasPoint);
  await dispatch({ pagePoint });
  await delay(16);
  const after = await getWorkflowGraphDebugSnapshot(client, surfaceId, false);
  samples.push({
    at: new Date().toISOString(),
    cameraAfter: after.camera,
    cameraBefore: before.camera,
    canvasPoint: event.canvasPoint,
    deltaX: event.deltaX ?? 0,
    deltaY: event.deltaY ?? 0,
    kind: event.kind,
    modifiers: event.modifiers,
    pagePoint,
    renderDeltas: renderDeltas(before, after),
    surfaceId,
    targetCanvas,
  });
}

async function startCdpTrace(client, artifactDir, name) {
  const traceEvents = [];
  const offData = client.onEvent("Tracing.dataCollected", ({ value = [] }) => {
    traceEvents.push(...value);
  });
  await client.call("Tracing.start", {
    categories: traceCategories.join(","),
    transferMode: "ReportEvents",
  });
  return {
    async stop() {
      const complete = client.waitForEvent("Tracing.tracingComplete", 30_000);
      await client.call("Tracing.end");
      await complete;
      offData();
      const path = join(artifactDir, `${name}-cdp-trace.json`);
      await writeJson(path, {
        traceEvents,
      });
      return {
        eventCount: traceEvents.length,
        path,
      };
    },
  };
}

async function installPerformanceTimelineRecorder(client) {
  return client.evaluate(`(() => {
    const existing = window.__settaWorkflowGraphPerformanceRecorder;
    if (existing) {
      existing.disconnect();
    }
    const state = {
      eventTimings: [],
      longTasks: [],
      observerErrors: [],
      startedAt: performance.now(),
      supportedEntryTypes:
        typeof PerformanceObserver === "function"
          ? [...PerformanceObserver.supportedEntryTypes]
          : []
    };
    const observers = [];
    function entrySnapshot(entry) {
      return {
        cancelable: Boolean(entry.cancelable),
        duration: entry.duration,
        entryType: entry.entryType,
        interactionId: entry.interactionId ?? 0,
        name: entry.name,
        processingEnd: entry.processingEnd ?? 0,
        processingStart: entry.processingStart ?? 0,
        startTime: entry.startTime,
        targetName: entry.target?.localName ?? ""
      };
    }
    function observe(type, target, options) {
      if (!state.supportedEntryTypes.includes(type)) {
        return;
      }
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            target.push(entrySnapshot(entry));
            if (target.length > 500) {
              target.shift();
            }
          }
        });
        observer.observe(options);
        observers.push(observer);
      } catch (error) {
        state.observerErrors.push(error instanceof Error ? error.message : String(error));
      }
    }
    observe("longtask", state.longTasks, { buffered: true, type: "longtask" });
    observe("event", state.eventTimings, {
      buffered: true,
      durationThreshold: 16,
      type: "event"
    });
    window.__settaWorkflowGraphPerformanceRecorder = {
      disconnect() {
        while (observers.length > 0) {
          observers.pop().disconnect();
        }
      },
      snapshot() {
        return {
          eventTimings: [...state.eventTimings],
          longTasks: [...state.longTasks],
          observerErrors: [...state.observerErrors],
          startedAt: state.startedAt,
          stoppedAt: performance.now(),
          supportedEntryTypes: [...state.supportedEntryTypes]
        };
      }
    };
    return window.__settaWorkflowGraphPerformanceRecorder.snapshot();
  })()`);
}

async function readPerformanceTimelineRecorder(client) {
  return client.evaluate(`(() => {
    const recorder = window.__settaWorkflowGraphPerformanceRecorder;
    return recorder ? recorder.snapshot() : null;
  })()`);
}

async function disconnectPerformanceTimelineRecorder(client) {
  return client.evaluate(`(() => {
    const recorder = window.__settaWorkflowGraphPerformanceRecorder;
    if (!recorder) {
      return false;
    }
    recorder.disconnect();
    delete window.__settaWorkflowGraphPerformanceRecorder;
    return true;
  })()`);
}

function renderDeltas(before, after) {
  return Object.fromEntries(
    renderDeltaCounters.map((counter) => [
      counter,
      Number(after.render[counter] ?? 0) - Number(before.render[counter] ?? 0),
    ]),
  );
}

function emptyRenderDeltas() {
  return Object.fromEntries(renderDeltaCounters.map((counter) => [counter, 0]));
}

function summarizeWorkflowGraphPerformanceDiagnostics({
  inputSamples,
  performanceTimeline,
  snapshots,
}) {
  const snapshotPair = workflowGraphPerformanceSnapshotPair(snapshots);
  return {
    inputCountsByKind: countInputSamplesByKind(inputSamples),
    inputEventCount: countRecordedInputEvents(inputSamples),
    interactionRenderDeltas: performanceRenderDeltas(snapshotPair),
    longTaskCount: performanceTimeline?.longTasks?.length ?? 0,
    maxEventTimingMs: maxDuration(performanceTimeline?.eventTimings ?? []),
    maxLongTaskMs: maxDuration(performanceTimeline?.longTasks ?? []),
    timingBucketDeltas: performanceTimingBucketDeltas(snapshotPair),
  };
}

function workflowGraphPerformanceSnapshotPair(snapshots) {
  return {
    after: snapshots.at(-1)?.snapshot ?? null,
    before: snapshots[0]?.snapshot ?? null,
  };
}

function performanceRenderDeltas({ after, before }) {
  if (!before || !after) {
    return emptyRenderDeltas();
  }
  return renderDeltas(before, after);
}

function performanceTimingBucketDeltas({ after, before }) {
  if (!before || !after) {
    return {};
  }
  return timingBucketDeltas(before, after);
}

function countInputSamplesByKind(inputSamples) {
  const counts = {};
  for (const sample of inputSamples) {
    counts[sample.kind] = (counts[sample.kind] ?? 0) + inputSampleEventCount(sample);
  }
  return counts;
}

function countRecordedInputEvents(inputSamples) {
  return inputSamples.reduce((sum, sample) => sum + inputSampleEventCount(sample), 0);
}

function inputSampleEventCount(sample) {
  if (sample.kind === "wheel-burst") {
    return sample.dispatched?.length ?? 0;
  }
  if (sample.kind === "pointer-select") {
    return 3;
  }
  return 1;
}

function maxDuration(entries) {
  return entries.reduce((max, entry) => Math.max(max, Number(entry.duration) || 0), 0);
}

function timingBucketDeltas(before, after) {
  const buckets = new Set([
    ...Object.keys(before.render.timingBuckets ?? {}),
    ...Object.keys(after.render.timingBuckets ?? {}),
  ]);
  return Object.fromEntries(
    [...buckets].map((bucket) => timingBucketDeltaEntry(before, after, bucket)),
  );
}

function timingBucketDeltaEntry(before, after, bucket) {
  return [
    bucket,
    timingBucketDeltaMetrics(
      timingBucketMetrics(before, bucket),
      timingBucketMetrics(after, bucket),
    ),
  ];
}

function timingBucketMetrics(snapshot, bucket) {
  const buckets = snapshot.render.timingBuckets;
  if (!buckets) {
    return {};
  }
  return buckets[bucket] ?? {};
}

function timingBucketDeltaMetrics(beforeBucket, afterBucket) {
  return {
    count: timingBucketNumericDelta(beforeBucket, afterBucket, "count"),
    totalMs: timingBucketNumericDelta(beforeBucket, afterBucket, "totalMs"),
    worstMs: timingBucketNumber(afterBucket, "worstMs"),
  };
}

function timingBucketNumericDelta(beforeBucket, afterBucket, key) {
  return timingBucketNumber(afterBucket, key) - timingBucketNumber(beforeBucket, key);
}

function timingBucketNumber(bucket, key) {
  return Number(bucket[key] ?? 0);
}

async function writeContactSheet(path, frames) {
  await mkdir(dirname(path), { recursive: true });
  const rows = frames
    .map(
      (frame) => `<figure>
  <img src="${escapeHtml(relativeFramePath(path, frame.path))}" alt="${escapeHtml(String(frame.elapsedMs))} ms">
  <figcaption>${escapeHtml(String(frame.elapsedMs))} ms</figcaption>
</figure>`,
    )
    .join("\n");
  await writeFile(
    path,
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Workflow Graph Fit Contact Sheet</title>
  <style>
    body { background: #0f172a; color: #e2e8f0; font: 12px system-ui, sans-serif; margin: 16px; }
    main { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    figure { margin: 0; }
    img { border: 1px solid #334155; display: block; max-width: 100%; }
    figcaption { margin-top: 4px; }
  </style>
</head>
<body>
<main>
${rows}
</main>
</body>
</html>
`,
  );
}

function relativeFramePath(sheetPath, framePath) {
  if (dirname(sheetPath) === dirname(framePath)) {
    return basename(framePath);
  }
  return `${basename(dirname(framePath))}/${basename(framePath)}`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
