/* global HTMLElement, KeyboardEvent, PerformanceObserver, document, performance, requestAnimationFrame, window */

(() => {
  const version = "setta-pane-drag-drop-performance-driver-v1";
  const paneHostSelector = '[data-testid="workspace-pane-host"]';
  const visiblePaneHostSelector = `${paneHostSelector}[data-visible="true"]`;
  const workspaceLayoutSelector = '[data-testid="workspace-layout-area"]';

  function installPaneDragDropPerformanceDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      paneDragDropFrameMetrics,
      paneDragDropHandleCenter,
      paneDragDropOverviewState,
      paneDragDropPaneSnapshot,
      paneDragDropPerformanceVersion: version,
      paneDragDropResetFrameMetrics,
      paneDragDropStartFrameSampler,
      paneDragDropStopFrameSampler,
      paneDragDropTargetState,
      paneDragDropToggleOverview,
      paneDragDropWorkspacePresentationMode,
    });
  }

  function paneDragDropWorkspacePresentationMode() {
    const area = document.querySelector(workspaceLayoutSelector);
    return area instanceof HTMLElement ? (area.dataset.presentationMode ?? "") : "";
  }

  function paneDragDropToggleOverview() {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "o",
        metaKey: true,
      }),
    );
    return { ok: true };
  }

  function paneDragDropHandleCenter({ paneId }) {
    const host = visiblePaneHostByPaneId(paneId);
    const handle = host?.querySelector('[data-workspace-pane-drag-handle="true"]');
    const target = dragHandleTarget(host, handle);
    if (!(target instanceof HTMLElement)) {
      return { ok: false, reason: "missing-target" };
    }
    const rect = target.getBoundingClientRect();
    return {
      ok: true,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function dragHandleTarget(host, handle) {
    const hostRect = host instanceof HTMLElement ? host.getBoundingClientRect() : null;
    const handleRect = handle instanceof HTMLElement ? handle.getBoundingClientRect() : null;
    if (!hostRect || !handleRect || handleRect.width <= 0 || handleRect.height <= 0) {
      return host;
    }
    const center = {
      x: handleRect.left + handleRect.width / 2,
      y: handleRect.top + handleRect.height / 2,
    };
    return pointInsideRect(center, hostRect) ? handle : host;
  }

  function paneDragDropStartFrameSampler() {
    if (window.__settaWorkspaceDragPerfStop) {
      return false;
    }
    const sampler = createFrameSampler();
    requestAnimationFrame(sampler.recordFrame);
    window.__settaWorkspaceDragPerfStop = sampler.stop;
    return true;
  }

  function paneDragDropStopFrameSampler() {
    if (!window.__settaWorkspaceDragPerfStop) {
      return { ok: false, reason: "missing-sampler" };
    }
    return { ok: true, sample: window.__settaWorkspaceDragPerfStop() };
  }

  function paneDragDropFrameMetrics() {
    return window.__settaWorkspaceReadFrameMetrics?.() ?? null;
  }

  function paneDragDropResetFrameMetrics() {
    if (!window.__settaWorkspaceResetFrameMetrics) {
      return false;
    }
    window.__settaWorkspaceResetFrameMetrics();
    return true;
  }

  function paneDragDropTargetState({ sourcePaneId, targetPaneId }) {
    const area = document.querySelector(workspaceLayoutSelector);
    const source = paneHostByPaneId(sourcePaneId);
    const target = paneHostByPaneId(targetPaneId);
    return {
      paneDragging: area instanceof HTMLElement ? (area.dataset.paneDragging ?? "") : "",
      sourceDragSource: source instanceof HTMLElement && source.dataset.dragSource === "true",
      targetDropAxis: target instanceof HTMLElement ? (target.dataset.dropAxis ?? "") : "",
      targetDropTarget: target instanceof HTMLElement ? (target.dataset.dropTarget ?? "") : "",
    };
  }

  function paneDragDropOverviewState({ sourcePaneId }) {
    const area = document.querySelector(workspaceLayoutSelector);
    const source = paneHostByPaneId(sourcePaneId);
    return {
      overviewDragging: area instanceof HTMLElement ? (area.dataset.overviewDragging ?? "") : "",
      sourceDragSource: source instanceof HTMLElement && source.dataset.dragSource === "true",
    };
  }

  function paneDragDropPaneSnapshot() {
    const area = document.querySelector(workspaceLayoutSelector);
    const stageRect = workspaceStageRect();
    const visibleHosts = Array.from(document.querySelectorAll(visiblePaneHostSelector)).map(
      (host) => paneHostSnapshot(host),
    );
    return {
      focusedPaneId: visibleHosts.find((host) => host.focused)?.paneId ?? "",
      ghost: overviewGhostSnapshot(),
      mode: workspaceDataset(area, "presentationMode"),
      overviewDragging: workspaceDataset(area, "overviewDragging"),
      paneDragging: workspaceDataset(area, "paneDragging"),
      stageRect: stageRectSnapshot(stageRect),
      totalPanes: workspaceDatasetNumber(area, "paneCount"),
      visibleHosts,
      workspaceId: workspaceDataset(area, "workspaceId"),
      workspaceMode: workspaceDataset(area, "workspaceMode"),
    };
  }

  function createFrameSampler() {
    const startedAt = performance.now();
    const frameDeltas = [];
    const longTasks = [];
    let observer = null;
    let previousTimestamp = startedAt;
    let running = true;
    let warmupFrames = 3;
    if (
      "PerformanceObserver" in window &&
      PerformanceObserver.supportedEntryTypes.includes("longtask")
    ) {
      observer = new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
          longTasks.push({ duration: entry.duration, startTime: entry.startTime });
        }
      });
      observer.observe({ type: "longtask" });
    }
    function recordFrame(timestamp) {
      if (!running) {
        return;
      }
      if (warmupFrames > 0) {
        warmupFrames -= 1;
        previousTimestamp = timestamp;
        requestAnimationFrame(recordFrame);
        return;
      }
      frameDeltas.push(timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      requestAnimationFrame(recordFrame);
    }
    function stop() {
      running = false;
      observer?.disconnect();
      window.__settaWorkspaceDragPerfStop = null;
      return frameSample(startedAt, frameDeltas, longTasks);
    }
    return { recordFrame, stop };
  }

  function frameSample(startedAt, frameDeltas, longTasks) {
    const samples = frameDeltas.slice(1).filter((value) => Number.isFinite(value) && value >= 0);
    const sorted = [...samples].sort((left, right) => left - right);
    const p50 = quantile(sorted, 0.5);
    const averageFrameDeltaMs =
      samples.length > 0 ? samples.reduce((total, value) => total + value, 0) / samples.length : 0;
    const gestureLongTasks = longTasks.filter((entry) => entry.startTime >= startedAt);
    return {
      averageFps: averageFrameDeltaMs > 0 ? 1000 / averageFrameDeltaMs : 0,
      averageFrameDeltaMs,
      durationMs: performance.now() - startedAt,
      frameCount: samples.length,
      framesMs: samples.map((value) => Number(value.toFixed(3))),
      longTaskCount: gestureLongTasks.length,
      longTaskTotalMs: gestureLongTasks.reduce((total, entry) => total + entry.duration, 0),
      maxFrameDeltaMs: sorted.at(-1) ?? 0,
      observedFrameBudgetMs: p50 <= 10 ? 8.33 : 16.67,
      p50FrameDeltaMs: p50,
      p95FrameDeltaMs: quantile(sorted, 0.95),
      p99FrameDeltaMs: quantile(sorted, 0.99),
      slowFramesOver120HzBudget: samples.filter((value) => value > 8.33).length,
      slowFramesOver16Ms: samples.filter((value) => value > 16.67).length,
      slowFramesOver32Ms: samples.filter((value) => value > 32).length,
      slowFramesOver50Ms: samples.filter((value) => value > 50).length,
    };
  }

  function paneHostByPaneId(paneId) {
    return Array.from(document.querySelectorAll(paneHostSelector)).find(
      (host) => host instanceof HTMLElement && host.dataset.paneId === paneId,
    );
  }

  function visiblePaneHostByPaneId(paneId) {
    return Array.from(document.querySelectorAll(visiblePaneHostSelector)).find(
      (host) => host instanceof HTMLElement && host.dataset.paneId === paneId,
    );
  }

  function paneHostSnapshot(host) {
    const rect = host.getBoundingClientRect();
    return {
      dragSource: host.dataset.dragSource === "true",
      dropAxis: host.dataset.dropAxis ?? "",
      dropPreview: host.dataset.dropPreview === "true",
      dropTarget: host.dataset.dropTarget ?? "",
      focused: host.dataset.focused === "true",
      paneId: host.dataset.paneId ?? "",
      presentationMode: host.dataset.presentationMode ?? "",
      rect: {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      },
    };
  }

  function overviewGhostSnapshot() {
    const ghost = document.querySelector("[data-workspace-overview-ghost]");
    if (!(ghost instanceof HTMLElement)) {
      return null;
    }
    const rect = ghost.getBoundingClientRect();
    return {
      placement: ghost.dataset.overviewGhostPlacement ?? "",
      paneId: ghost.dataset.overviewGhostPaneId ?? "",
      rect: { height: rect.height, left: rect.left, top: rect.top, width: rect.width },
    };
  }

  function workspaceStageRect() {
    const stage = document.querySelector('[data-testid="workspace-presentation-engine"]');
    return stage instanceof HTMLElement ? stage.getBoundingClientRect() : emptyRect();
  }

  function stageRectSnapshot(rect) {
    return {
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width,
    };
  }

  function workspaceDataset(element, key) {
    return element instanceof HTMLElement ? (element.dataset[key] ?? "") : "";
  }

  function workspaceDatasetNumber(element, key) {
    return Number(workspaceDataset(element, key) || "0");
  }

  function pointInsideRect(point, rect) {
    return (
      point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
    );
  }

  function emptyRect() {
    return { height: 0, left: 0, top: 0, width: 0 };
  }

  function quantile(sorted, percentile) {
    if (sorted.length === 0) {
      return 0;
    }
    const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentile));
    return sorted[index];
  }

  installPaneDragDropPerformanceDriver();
})();
