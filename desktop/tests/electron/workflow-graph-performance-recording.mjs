import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

import { captureScreenshotClip, writeJson } from "./electron-cdp-harness.mjs";
import { pagePointForCanvasPoint } from "./workflow-graph-layout-helpers.mjs";
import {
  cameraInputKinds,
  workflowGraphInputInteractionMetrics,
  workflowGraphLongTaskMetrics,
} from "./workflow-graph-performance-interactions.mjs";

const traceCategories = [
  "benchmark",
  "blink.user_timing",
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-devtools.timeline.invalidationTracking",
  "disabled-by-default-v8.cpu_profiler",
  "disabled-by-default-v8.gc",
  "loading",
  "toplevel",
  "v8",
];

const renderDeltaCounters = [
  "animationActiveSetDeferredCount",
  "canvasCreationCount",
  "cameraDependentSyncFrameCount",
  "cameraFastPathViolationCount",
  "cameraMovingLabelDeferredFrameCount",
  "cameraMovingLabelHiddenFrameCount",
  "cameraMovingLabelSyncedFrameCount",
  "cameraMovingLabelTransformCount",
  "cameraMovingLabelTransformFrameCount",
  "cameraMovingSyncFrameCount",
  "cameraSettleLabelSyncCount",
  "cameraSettleRestoreFrameCount",
  "cameraSettledSyncFrameCount",
  "cameraUpdateCount",
  "deferredGraphApplyCount",
  "deferredGraphUpdateCount",
  "frameCount",
  "graphUpdateCount",
  "labelSyncCount",
  "nodeDragUpdateCount",
  "pointerPanUpdateCount",
  "reactRenderCount",
  "rendererDestroyCount",
  "sceneWindowChangeCount",
  "spatialIndexQueryCount",
  "trajectorySpriteSyncCount",
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
  const traceSummaryPath = join(artifactDir, `${name}-cdp-trace-summary.json`);
  await writeJson(snapshotsPath, snapshots);
  await writeJson(inputSamplesPath, inputSamples);
  await writeJson(performancePath, performanceTimeline);
  await writeJson(traceSummaryPath, traceResult.summary);
  return {
    inputSamplesPath,
    metrics: summarizeWorkflowGraphPerformanceDiagnostics({
      inputSamples,
      performanceTimeline,
      snapshots,
    }),
    performancePath,
    snapshotsPath,
    traceSummaryPath,
    tracePath: traceResult.path,
    traceSummary: traceResult.summary,
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
  await beginRecordedInput(client, surfaceId, {
    canvasPoint: { x, y },
    kind: "wheel-burst",
    modifiers,
  });
  const dispatched = [];
  const pendingDispatches = [];
  try {
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
  } finally {
    await endRecordedInput(client, surfaceId, "wheel-burst");
  }
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
    const debugRegistry = await workflowGraphDebugRegistrySnapshot(client, surfaceId);
    const sample = {
      at: new Date().toISOString(),
      debugRegistry,
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

async function workflowGraphDebugRegistrySnapshot(client, surfaceId) {
  return client.evaluate(`(() => {
    const api = window.__settaWorkflowGraphDebug;
    const surfaceIds = api?.getSurfaceIds?.() ?? [];
    const requestedSurfaceId = ${JSON.stringify(surfaceId)};
    const host = [...document.querySelectorAll('[data-testid="workflow-graph"]')].find(
      (candidate) => candidate.dataset.surfaceId === requestedSurfaceId
    );
    return {
      activeRendererCount: surfaceIds.length,
      canvasCountForSurface: host?.querySelectorAll("canvas").length ?? 0,
      focusedSurfaceRegistered: surfaceIds.includes(requestedSurfaceId),
      surfaceIds,
    };
  })()`);
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
  const inputToken = await beginRecordedInput(client, surfaceId, event);
  try {
    await dispatch({ pagePoint });
    await delay(16);
  } finally {
    await endRecordedInput(client, surfaceId, inputToken);
  }
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

async function beginRecordedInput(client, surfaceId, event) {
  return client.evaluate(
    `(() => {
      const recorder = window.__settaWorkflowGraphPerformanceRecorder;
      if (!recorder || typeof recorder.beginInput !== "function") {
        return null;
      }
      return recorder.beginInput(${JSON.stringify({
        cameraInput: cameraInputKinds.has(event.kind),
        canvasPoint: event.canvasPoint ?? null,
        kind: event.kind,
        modifiers: event.modifiers ?? 0,
        surfaceId,
      })});
    })()`,
  );
}

async function endRecordedInput(client, surfaceId, tokenOrKind) {
  await client.evaluate(
    `(() => {
      const recorder = window.__settaWorkflowGraphPerformanceRecorder;
      if (!recorder || typeof recorder.endInput !== "function") {
        return false;
      }
      return recorder.endInput(${JSON.stringify({ surfaceId, tokenOrKind })});
    })()`,
  );
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
        summary: summarizeCdpTrace(traceEvents),
      };
    },
  };
}

function summarizeCdpTrace(traceEvents) {
  const completeEvents = traceEvents
    .filter((event) => event?.ph === "X" && Number.isFinite(event.dur))
    .map((event) => ({
      category: String(event.cat ?? ""),
      durationMs: event.dur / 1000,
      name: String(event.name ?? ""),
      threadId: event.tid ?? null,
      timestampMs: Number.isFinite(event.ts) ? event.ts / 1000 : null,
    }))
    .sort((left, right) => right.durationMs - left.durationMs);
  const topLevelTasks = completeEvents.filter((event) =>
    /RunTask|ThreadControllerImpl::RunTask|TaskQueueManager::ProcessTaskFromWorkQueue/.test(
      event.name,
    ),
  );
  return {
    eventCount: traceEvents.length,
    topCompleteEvents: completeEvents.slice(0, 20),
    topLevelTasks: topLevelTasks.slice(0, 20),
  };
}

async function installPerformanceTimelineRecorder(client) {
  return client.evaluate(`(() => {
    const existing = window.__settaWorkflowGraphPerformanceRecorder;
    if (existing) {
      existing.disconnect();
    }
    const state = {
      activeInputs: [],
      completedInputs: [],
      eventTimings: [],
      longTasks: [],
      mutationCountsByOwnerAndSource: {},
      nextInputToken: 1,
      observerErrors: [],
      paneMutations: [],
      reactCommits: [],
      startedAt: performance.now(),
      supportedEntryTypes:
        typeof PerformanceObserver === "function"
          ? [...PerformanceObserver.supportedEntryTypes]
          : [],
      userTimings: []
    };
    const observers = [];
    const mutationObserver =
      typeof MutationObserver === "function"
        ? new MutationObserver((records) => recordPaneMutations(records))
        : null;
    function entrySnapshot(entry) {
      return {
        cancelable: Boolean(entry.cancelable),
        detail: entry.detail ?? null,
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
    function observeUserTiming(type) {
      observe(type, state.userTimings, { buffered: true, type });
    }
    observe("longtask", state.longTasks, { buffered: true, type: "longtask" });
    observe("event", state.eventTimings, {
      buffered: true,
      durationThreshold: 16,
      type: "event"
    });
    observeUserTiming("mark");
    observeUserTiming("measure");
    if (mutationObserver !== null) {
      mutationObserver.observe(document.documentElement, {
        attributes: true,
        attributeOldValue: true,
        childList: true,
        subtree: true
      });
    }
    window.__settaWorkflowGraphPhase0ReactCommit = (commit) => {
      const record = {
        ...commit,
        at: performance.now(),
        causalSource: currentCausalSource()
      };
      state.reactCommits.push(record);
      trimArray(state.reactCommits, 500);
      performance.mark("setta.workflow-graph.react-commit", { detail: record });
    };
    window.__settaWorkflowGraphPerformanceRecorder = {
      beginInput(input) {
        const token = state.nextInputToken;
        state.nextInputToken += 1;
        const record = {
          ...input,
          causalSource: input.cameraInput ? "camera:" + input.kind : "interaction:" + input.kind,
          startedAt: performance.now(),
          token
        };
        state.activeInputs.push(record);
        performance.mark("setta.workflow-graph.input.start", { detail: record });
        return token;
      },
      disconnect() {
        while (observers.length > 0) {
          observers.pop().disconnect();
        }
        mutationObserver?.disconnect();
        if (window.__settaWorkflowGraphPhase0ReactCommit) {
          delete window.__settaWorkflowGraphPhase0ReactCommit;
        }
        clearSettaPerformanceEntries();
      },
      endInput({ tokenOrKind }) {
        const index =
          typeof tokenOrKind === "number"
            ? state.activeInputs.findIndex((input) => input.token === tokenOrKind)
            : findLastInputIndexByKind(tokenOrKind);
        if (index < 0) {
          return false;
        }
        const [record] = state.activeInputs.splice(index, 1);
        const ended = {
          ...record,
          durationMs: performance.now() - record.startedAt,
          endedAt: performance.now()
        };
        state.completedInputs.push(ended);
        trimArray(state.completedInputs, 500);
        performance.mark("setta.workflow-graph.input.end", { detail: ended });
        return true;
      },
      snapshot() {
        return {
          completedInputs: [...state.completedInputs],
          eventTimings: [...state.eventTimings],
          longTasks: [...state.longTasks],
          mutationCountsByOwnerAndSource: { ...state.mutationCountsByOwnerAndSource },
          observerErrors: [...state.observerErrors],
          paneMutations: [...state.paneMutations],
          reactCommits: [...state.reactCommits],
          startedAt: state.startedAt,
          stoppedAt: performance.now(),
          supportedEntryTypes: [...state.supportedEntryTypes],
          userTimings: [...state.userTimings]
        };
      }
    };
    function recordPaneMutations(records) {
      for (const mutation of records) {
        const target = mutationTargetElement(mutation.target);
        const owner = paneMutationOwner(target);
        if (owner === null) {
          continue;
        }
        const record = {
          addedNodes: mutation.addedNodes?.length ?? 0,
          attributeName: mutation.attributeName ?? "",
          at: performance.now(),
          causalSource: currentCausalSource(),
          oldValue: mutation.oldValue ?? null,
          owner,
          removedNodes: mutation.removedNodes?.length ?? 0,
          targetClassName: target?.className ?? "",
          targetTestId: target?.dataset?.testid ?? target?.dataset?.testId ?? "",
          type: mutation.type
        };
        state.paneMutations.push(record);
        trimArray(state.paneMutations, 1000);
        incrementMutationCount(record);
        if (record.causalSource.startsWith("camera:")) {
          performance.mark("setta.workspace.presentation.disallowed-write", { detail: record });
        }
      }
    }
    function mutationTargetElement(target) {
      if (target instanceof Element) {
        return target;
      }
      return target?.parentElement ?? null;
    }
    function paneMutationOwner(target) {
      if (!(target instanceof Element)) {
        return null;
      }
      const paneHost = target.closest('[data-testid="workspace-pane-host"]');
      const paneChrome =
        target.closest(".workspace-pane-top-bar") ??
        target.closest(".workspace-pane-action-strip") ??
        target.closest(".workspace-pane-action-button") ??
        target.closest(".workspace-pane-drag-handle") ??
        target.closest(".workspace-pane-resize-handle");
      if (paneHost === null && paneChrome === null) {
        return null;
      }
      const host = paneHost ?? paneChrome?.closest('[data-testid="workspace-pane-host"]');
      return {
        component: paneMutationComponent(target),
        paneId: host?.dataset?.paneId ?? paneChrome?.dataset?.paneId ?? "",
        subsystem: paneChrome === null ? "workspace-pane-host" : "workspace-pane-chrome",
        surfaceId: host?.dataset?.surfaceId ?? "",
      };
    }
    function paneMutationComponent(target) {
      if (!(target instanceof Element)) {
        return "";
      }
      const owner = target.closest("[data-workspace-presentation-owner]");
      if (owner instanceof HTMLElement) {
        return owner.dataset.workspacePresentationOwner ?? "";
      }
      if (target.closest(".workspace-pane-resize-handle")) {
        return "pane-resize-handle";
      }
      if (target.closest(".workspace-pane-action-button")) {
        return "pane-action-button";
      }
      if (target.closest(".workspace-pane-action-strip")) {
        return "pane-action-strip";
      }
      if (target.closest(".workspace-pane-drag-handle")) {
        return "pane-drag-handle";
      }
      if (target.closest(".workspace-pane-top-bar")) {
        return "pane-top-bar";
      }
      if (target.closest('[data-testid="workspace-pane-host"]')) {
        return "pane-host";
      }
      return "";
    }
    function currentCausalSource() {
      const active = state.activeInputs.at(-1);
      return active?.causalSource ?? "unattributed";
    }
    function findLastInputIndexByKind(kind) {
      for (let index = state.activeInputs.length - 1; index >= 0; index -= 1) {
        if (state.activeInputs[index].kind === kind) {
          return index;
        }
      }
      return -1;
    }
    function incrementMutationCount(record) {
      const key = [
        record.owner.subsystem,
        record.owner.component,
        record.owner.paneId,
        record.owner.surfaceId,
        record.causalSource,
        record.type,
        record.attributeName
      ].join("|");
      state.mutationCountsByOwnerAndSource[key] =
        (state.mutationCountsByOwnerAndSource[key] ?? 0) + 1;
    }
    function trimArray(array, limit) {
      while (array.length > limit) {
        array.shift();
      }
    }
    function clearSettaPerformanceEntries() {
      if (typeof performance.getEntriesByType !== "function") {
        return;
      }
      if (typeof performance.clearMarks === "function") {
        for (const entry of performance.getEntriesByType("mark")) {
          if (settaPerformanceEntry(entry)) {
            performance.clearMarks(entry.name);
          }
        }
      }
      if (typeof performance.clearMeasures === "function") {
        for (const entry of performance.getEntriesByType("measure")) {
          if (settaPerformanceEntry(entry)) {
            performance.clearMeasures(entry.name);
          }
        }
      }
    }
    function settaPerformanceEntry(entry) {
      return (
        entry.name.startsWith("setta.workflow-graph.") ||
        entry.name.startsWith("setta.workspace.presentation.")
      );
    }
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

export function summarizeWorkflowGraphPerformanceDiagnostics({
  inputSamples,
  performanceTimeline,
  snapshots,
}) {
  const snapshotPair = workflowGraphPerformanceSnapshotPair(snapshots);
  const renderDeltas = performanceRenderDeltas(snapshotPair);
  const inputInteractions = workflowGraphInputInteractionMetrics(performanceTimeline, inputSamples);
  const longTasks = workflowGraphLongTaskMetrics(performanceTimeline, inputInteractions.items);
  return {
    deferredWorkByLane: workflowGraphDeferredWorkByLaneMetrics(renderDeltas),
    frameTiming: workflowGraphFrameTimingMetrics(snapshotPair.after),
    graphSceneReplacementCount: sumCameraInputRenderDelta(inputSamples, "graphUpdateCount"),
    inputCountsByKind: countInputSamplesByKind(inputSamples),
    inputEventCount: countRecordedInputEvents(inputSamples),
    inputInteractions,
    inputWindow: inputSampleWindow(inputSamples),
    interactionRenderDeltas: renderDeltas,
    longTaskCount: longTasks.cameraOverlappingCount,
    longTasks,
    maxEventTimingMs: maxDuration(performanceTimeline?.eventTimings ?? []),
    maxLongTaskMs: longTasks.maxCameraOverlappingDurationMs,
    maxObservedLongTaskMs: longTasks.maxObservedDurationMs,
    observedLongTaskCount: longTasks.observedCount,
    paneMutations: workflowGraphPaneMutationMetrics(performanceTimeline),
    reactCommits: workflowGraphReactCommitMetrics(performanceTimeline),
    rendererLifecycle: workflowGraphRendererLifecycleMetrics(snapshotPair, snapshots),
    supplementalRenderMetrics: workflowGraphSupplementalRenderMetrics(snapshotPair.after),
    timingBucketDeltas: performanceTimingBucketDeltas(snapshotPair),
    userTiming: workflowGraphUserTimingMetrics(performanceTimeline),
    wheelLatency: workflowGraphWheelLatencyMetrics(snapshotPair.after),
  };
}

function sumCameraInputRenderDelta(inputSamples, counter) {
  return inputSamples
    .filter((sample) => cameraInputKinds.has(sample.kind))
    .reduce((sum, sample) => sum + Number(sample.renderDeltas?.[counter] ?? 0), 0);
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

function inputSampleWindow(inputSamples) {
  const timestamps = inputSamples
    .map((sample) => Date.parse(sample.at))
    .filter((timestamp) => Number.isFinite(timestamp));
  if (timestamps.length === 0) {
    return {
      firstAt: "",
      lastAt: "",
    };
  }
  return {
    firstAt: new Date(Math.min(...timestamps)).toISOString(),
    lastAt: new Date(Math.max(...timestamps)).toISOString(),
  };
}

function maxDuration(entries) {
  return entries.reduce((max, entry) => Math.max(max, Number(entry.duration) || 0), 0);
}

function workflowGraphWheelLatencyMetrics(snapshot) {
  const samples = (snapshot?.render?.wheelInput?.samples ?? []).filter(
    (sample) => sample.cameraChanged === true,
  );
  const eventDeliveryDelayMs = finiteSampleValues(samples, "eventTimestampDeltaMs");
  const eventTimestampToCameraUpdateMs = finiteSampleValues(
    samples,
    "eventTimestampToCameraUpdateMs",
  );
  const eventTimestampToFirstPixiRenderAfterCameraMs = finiteSampleValues(
    samples,
    "eventTimestampToFirstPixiRenderAfterCameraMs",
  );
  const eventToCameraUpdateMs = finiteSampleValues(samples, "eventToCameraUpdateMs");
  const eventToFirstPixiRenderAfterCameraMs = finiteSampleValues(
    samples,
    "eventToFirstPixiRenderAfterCameraMs",
  );
  const handlerDurationMs = finiteSampleValues(samples, "handlerDurationMs");
  const cameraUpdateDurationMs = finiteSampleValues(samples, "cameraUpdateDurationMs");
  return {
    cameraUpdateDurationMs: sampleStats(cameraUpdateDurationMs),
    eventDeliveryDelayMs: sampleStats(eventDeliveryDelayMs),
    eventTimestampToCameraUpdateMs: sampleStats(eventTimestampToCameraUpdateMs),
    eventTimestampToFirstPixiRenderAfterCameraMs: sampleStats(
      eventTimestampToFirstPixiRenderAfterCameraMs,
    ),
    eventToCameraUpdateMs: sampleStats(eventToCameraUpdateMs),
    eventToFirstPixiRenderAfterCameraMs: sampleStats(eventToFirstPixiRenderAfterCameraMs),
    handlerDurationMs: sampleStats(handlerDurationMs),
    maxEventDeliveryDelayMs: maxNumber(eventDeliveryDelayMs),
    maxEventToCameraUpdateMs: maxNumber(eventToCameraUpdateMs),
    maxEventToFirstPixiRenderAfterCameraMs: maxNumber(eventToFirstPixiRenderAfterCameraMs),
    p50EventDeliveryDelayMs: percentile(eventDeliveryDelayMs, 0.5),
    p95EventToCameraUpdateMs: percentile(eventToCameraUpdateMs, 0.95),
    p95EventToFirstPixiRenderAfterCameraMs: percentile(eventToFirstPixiRenderAfterCameraMs, 0.95),
    p95HandlerDurationMs: percentile(handlerDurationMs, 0.95),
    p95CameraUpdateDurationMs: percentile(cameraUpdateDurationMs, 0.95),
    sampleCount: samples.length,
  };
}

function sampleStats(values) {
  return {
    max: maxNumber(values),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    sampleCount: values.length,
  };
}

function workflowGraphFrameTimingMetrics(snapshot) {
  const render = snapshotRender(snapshot);
  const recentFrameMs = finiteFrameSamples(render.recentFrameMs);
  if (recentFrameMs.length > 0) {
    return frameTimingFromSamples(recentFrameMs);
  }
  return frameTimingFromSummary(render);
}

function snapshotRender(snapshot) {
  return snapshot && snapshot.render ? snapshot.render : {};
}

function finiteFrameSamples(samples) {
  if (!Array.isArray(samples)) {
    return [];
  }
  return samples.map(Number).filter(Number.isFinite);
}

function frameTimingFromSamples(samples) {
  return {
    ...sampleStats(samples),
    source: "renderer-recent-frame-ring",
  };
}

function frameTimingFromSummary(render) {
  return {
    max: Number(render.worstFrameMs ?? 0),
    p50: Number(render.averageFrameMs ?? 0),
    p95: Number(render.p95FrameMs ?? 0),
    p99: Number(render.worstFrameMs ?? 0),
    sampleCount: 0,
    source: "renderer-summary-counters",
  };
}

function workflowGraphDeferredWorkByLaneMetrics(renderDeltas) {
  return {
    "animation-active-set": Number(renderDeltas.animationActiveSetDeferredCount ?? 0),
    "graph-apply": Number(renderDeltas.deferredGraphApplyCount ?? 0),
    "graph-update": Number(renderDeltas.deferredGraphUpdateCount ?? 0),
    "label-position-sync": Number(renderDeltas.cameraMovingLabelDeferredFrameCount ?? 0),
  };
}

function workflowGraphSupplementalRenderMetrics(snapshot) {
  const render = snapshotRender(snapshot);
  const drawCallCount = renderDrawCallCount(render);
  return {
    drawCallCount,
    drawCallSource: drawCallCount === null ? "not-instrumented" : "debug-snapshot",
    renderedObjectCount: Number(render.totalDisplayObjectCount ?? 0),
  };
}

function renderDrawCallCount(render) {
  return finiteNumberOrNull(render.drawCallCount ?? render.drawCalls);
}

function finiteNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteSampleValues(samples, key) {
  return samples.map((sample) => Number(sample[key])).filter((value) => Number.isFinite(value));
}

function maxNumber(values) {
  return values.length === 0 ? 0 : Math.max(...values);
}

function percentile(values, percentileValue) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(percentileValue * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function workflowGraphPaneMutationMetrics(performanceTimeline) {
  const mutations = performanceTimeline?.paneMutations ?? [];
  const cameraMutations = mutations.filter((mutation) =>
    String(mutation.causalSource ?? "").startsWith("camera:"),
  );
  return {
    cameraCausedCount: cameraMutations.length,
    countsByOwnerAndSource: performanceTimeline?.mutationCountsByOwnerAndSource ?? {},
    samples: mutations.slice(-80),
    totalCount: mutations.length,
  };
}

function workflowGraphReactCommitMetrics(performanceTimeline) {
  const commits = performanceTimeline?.reactCommits ?? [];
  const cameraCommits = commits.filter((commit) =>
    String(commit.causalSource ?? "").startsWith("camera:"),
  );
  return {
    cameraCausedCount: cameraCommits.length,
    countsByOwnerAndSource: countRecordsBy(commits, (commit) =>
      [commit.id ?? "", commit.surfaceId ?? "", commit.causalSource ?? "unattributed"].join("|"),
    ),
    samples: commits.slice(-80),
    totalCount: commits.length,
  };
}

function workflowGraphRendererLifecycleMetrics({ after, before }, snapshots) {
  const beforeRender = before?.render ?? {};
  const afterRender = after?.render ?? {};
  const registrySamples = snapshots.map((sample) => sample.debugRegistry).filter(Boolean);
  const beforeRendererDestroyCount = renderCounter(beforeRender, "rendererDestroyCount");
  const beforeRendererInstanceId = renderCounter(beforeRender, "rendererInstanceId");
  const afterRendererDestroyCount = renderCounter(afterRender, "rendererDestroyCount");
  const afterRendererInstanceId = renderCounter(afterRender, "rendererInstanceId");
  const canvasCreationDelta =
    renderCounter(afterRender, "canvasCreationCount") -
    renderCounter(beforeRender, "canvasCreationCount");
  return {
    afterRendererDestroyCount,
    afterRendererInstanceId,
    beforeRendererDestroyCount,
    beforeRendererInstanceId,
    canvasCreationDelta,
    duplicateRendererSamples: registrySamples.filter(duplicateRendererSample),
    maxActiveRendererCount: maxRegistryCounter(registrySamples, "activeRendererCount"),
    maxCanvasCountForSurface: maxRegistryCounter(registrySamples, "canvasCountForSurface"),
    rendererDestroyDelta: afterRendererDestroyCount - beforeRendererDestroyCount,
    rendererInstanceChanged: beforeRendererInstanceId !== afterRendererInstanceId,
  };
}

function renderCounter(render, key) {
  return Number(render[key] ?? 0);
}

function duplicateRendererSample(sample) {
  return sample.canvasCountForSurface !== 1 || sample.focusedSurfaceRegistered !== true;
}

function maxRegistryCounter(registrySamples, key) {
  return maxNumber(registrySamples.map((sample) => Number(sample[key] ?? 0)));
}

function workflowGraphUserTimingMetrics(performanceTimeline) {
  const timings = performanceTimeline?.userTimings ?? [];
  return {
    markCount: timings.filter((entry) => entry.entryType === "mark").length,
    measureCount: timings.filter((entry) => entry.entryType === "measure").length,
    presentationApplyMeasures: timings.filter(
      (entry) =>
        entry.entryType === "measure" && entry.name === "setta.workspace.presentation.apply",
    ).length,
    samples: timings.slice(-120),
  };
}

function countRecordsBy(records, keyForRecord) {
  const counts = {};
  for (const record of records) {
    const key = keyForRecord(record);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
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
