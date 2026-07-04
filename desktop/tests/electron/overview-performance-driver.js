/* global HTMLButtonElement, HTMLElement, HTMLImageElement, KeyboardEvent, PerformanceObserver, document, performance, requestAnimationFrame, window */

(() => {
  const version = "setta-overview-performance-driver-v1";
  const workspaceLayoutSelector = '[data-testid="workspace-layout-area"]';
  const paneHostSelector = '[data-testid="workspace-pane-host"]';

  function installOverviewPerformanceDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      overviewBrowserSnapshotImages,
      overviewClickButton,
      overviewFrameMetrics,
      overviewMeasureTransition,
      overviewNativeBrowserStats,
      overviewOpenBrowserPane,
      overviewOpenProjectFolder,
      overviewPaneHostState,
      overviewPerformanceVersion: version,
      overviewPresentationMode,
      overviewVisibleBrowserHostCount,
      overviewWorkspaceId,
      overviewWorkspaceSnapshot,
    });
  }

  function overviewWorkspaceId() {
    const area = document.querySelector(workspaceLayoutSelector);
    return area instanceof HTMLElement ? (area.dataset.workspaceId ?? "") : "";
  }

  function overviewPresentationMode() {
    const area = document.querySelector(workspaceLayoutSelector);
    return area instanceof HTMLElement ? (area.dataset.presentationMode ?? "") : "";
  }

  function overviewWorkspaceSnapshot() {
    const area = document.querySelector(workspaceLayoutSelector);
    const hosts = Array.from(document.querySelectorAll(".workspace-pane-host")).map((host) => {
      if (!(host instanceof HTMLElement)) {
        return { visible: false };
      }
      return {
        focused: host.dataset.focused ?? "",
        paneId: host.dataset.paneId ?? "",
        presentationMode: host.dataset.presentationMode ?? "",
        runtimeState: host.dataset.runtimeState ?? "",
        surfaceKind: host.dataset.surfaceKind ?? "",
        visible: host.dataset.visible === "true",
      };
    });
    return {
      hosts,
      mode: area instanceof HTMLElement ? (area.dataset.presentationMode ?? "") : "",
      visibleHosts: hosts.filter((host) => host.visible).length,
      workspaceId: area instanceof HTMLElement ? (area.dataset.workspaceId ?? "") : "",
    };
  }

  function overviewClickButton({ buttonLabel }) {
    const button = document.querySelector(`button[aria-label="${cssEscape(buttonLabel)}"]`);
    if (!(button instanceof HTMLButtonElement)) {
      return { buttonLabel, ok: false, reason: "missing-overview-button" };
    }
    if (button.disabled) {
      return { buttonLabel, ok: false, reason: "disabled-overview-button" };
    }
    button.click();
    return { ok: true };
  }

  function overviewOpenProjectFolder() {
    const button = document.querySelector('button[aria-label="Open project folder"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-open-project-folder-button" };
    }
    if (button.disabled) {
      return { ok: false, reason: "disabled-open-project-folder-button" };
    }
    button.click();
    return { ok: true };
  }

  function overviewVisibleBrowserHostCount() {
    return Array.from(document.querySelectorAll(".workspace-pane-host")).filter(
      (host) =>
        host instanceof HTMLElement &&
        host.dataset.surfaceKind === "browser" &&
        host.dataset.visible === "true",
    ).length;
  }

  function overviewOpenBrowserPane() {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        altKey: true,
        bubbles: true,
        cancelable: true,
        key: "b",
        metaKey: true,
      }),
    );
    return { ok: true };
  }

  async function overviewNativeBrowserStats() {
    const api = window.setta?.workspaceNativeViews;
    if (!api?.readBrowserViewStats) {
      return null;
    }
    return api.readBrowserViewStats();
  }

  async function overviewBrowserSnapshotImages() {
    const mode = overviewPresentationMode();
    const nativeStats =
      (await window.setta?.workspaceNativeViews?.readBrowserViewStats?.()) ?? null;
    const snapshots = Array.from(
      document.querySelectorAll(
        '.workspace-pane-host[data-surface-kind="browser"][data-visible="true"]',
      ),
    ).map((host) => browserSnapshotImage(host, mode));
    return {
      nativeStats,
      ready: snapshots.filter((snapshot) => snapshot.ready),
      snapshots,
    };
  }

  function overviewFrameMetrics() {
    return window.__settaWorkspaceReadFrameMetrics?.() ?? null;
  }

  function overviewPaneHostState(query) {
    const normalizedQuery = normalizePaneHostQuery(query);
    const hosts = Array.from(document.querySelectorAll(paneHostSelector));
    const host = hosts.find((candidate) => paneHostMatches(candidate, normalizedQuery));
    if (!(host instanceof HTMLElement)) {
      return missingPaneHostState(hosts);
    }
    return paneHostState(host);
  }

  async function overviewMeasureTransition({
    buttonLabel,
    includeMetricSamples = false,
    includeNativeBrowserStats = false,
    name,
    requireWorkspaceFrameMetrics = false,
    sampleMs = 1400,
  }) {
    const target = overviewTransitionTarget(buttonLabel);
    if (!target.ok) {
      return target;
    }
    const readMetrics = () => window.__settaWorkspaceReadFrameMetrics?.() ?? null;
    const metricsBefore = readMetrics();
    const metricFailure = workspaceMetricRequirementFailure(
      requireWorkspaceFrameMetrics,
      metricsBefore,
    );
    if (metricFailure) {
      return metricFailure;
    }

    const nativeBrowserStats = [];
    const measurement = startTransitionMeasurement(readMetrics, includeMetricSamples, target.area);
    await maybeRecordNativeBrowserStats(
      includeNativeBrowserStats,
      nativeBrowserStats,
      "before-click",
    );

    requestAnimationFrame(measurement.recordFrame);
    target.button.click();
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const metricsAfter80Ms = readMetrics();
    await maybeRecordNativeBrowserStats(
      includeNativeBrowserStats,
      nativeBrowserStats,
      "after-click-80ms",
    );
    await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, sampleMs - 80)));
    measurement.stop();
    const metricsAfterTransition = readMetrics();
    await maybeRecordNativeBrowserStats(
      includeNativeBrowserStats,
      nativeBrowserStats,
      "after-transition",
    );

    const result = overviewTransitionResult({
      area: target.area,
      measurement,
      name,
    });
    addWorkspaceMetrics(result, includeMetricSamples || requireWorkspaceFrameMetrics, {
      metricSamples: measurement.metricSamples,
      metricsAfter80Ms,
      metricsAfterTransition,
      metricsBefore,
    });
    addNativeBrowserStats(result, includeNativeBrowserStats, nativeBrowserStats);
    return result;
  }

  function browserSnapshotImage(host, mode) {
    const image = host.querySelector("[data-workspace-browser-snapshot]");
    const hostRect = host.getBoundingClientRect();
    return {
      hostHeight: hostRect.height,
      hostStyleHeight: elementStyleNumber(host, "height"),
      hostStyleWidth: elementStyleNumber(host, "width"),
      hostWidth: hostRect.width,
      imageHeight: imagePixel(image, "height"),
      imageHidden: imageHidden(image),
      imageWidth: imagePixel(image, "width"),
      mode,
      naturalHeight: imagePixel(image, "naturalHeight"),
      naturalWidth: imagePixel(image, "naturalWidth"),
      paneId: datasetValue(host, "paneId"),
      ready: browserSnapshotReady(image),
      runtimeState: datasetValue(host, "runtimeState"),
    };
  }

  function elementStyleNumber(element, property) {
    return Number.parseFloat(element.style[property] || "0");
  }

  function imagePixel(image, property) {
    if (!(image instanceof HTMLImageElement)) {
      return 0;
    }
    return image[property];
  }

  function imageHidden(image) {
    if (!(image instanceof HTMLImageElement)) {
      return true;
    }
    return image.hidden;
  }

  function browserSnapshotReady(image) {
    return (
      image instanceof HTMLImageElement &&
      image.parentElement instanceof HTMLElement &&
      image.parentElement.dataset.browserSnapshotReady === "true"
    );
  }

  function normalizePaneHostQuery({ paneId = null, surfaceId = null, surfaceKind = null } = {}) {
    return { paneId, surfaceId, surfaceKind };
  }

  function paneHostMatches(candidate, query) {
    if (!(candidate instanceof HTMLElement)) {
      return false;
    }
    return (
      datasetMatches(candidate, "paneId", query.paneId) &&
      datasetMatches(candidate, "surfaceId", query.surfaceId) &&
      datasetMatches(candidate, "surfaceKind", query.surfaceKind)
    );
  }

  function datasetMatches(element, key, expected) {
    return expected === null || element.dataset[key] === expected;
  }

  function missingPaneHostState(hosts) {
    return {
      hosts: hosts.map(paneHostListItem),
      ok: false,
      reason: "missing-host",
    };
  }

  function paneHostListItem(candidate) {
    return {
      focused: datasetValue(candidate, "focused"),
      maximized: datasetValue(candidate, "maximized"),
      paneId: datasetValue(candidate, "paneId"),
      runtimeState: datasetValue(candidate, "runtimeState"),
      surfaceFrozen: datasetValue(candidate, "surfaceFrozen"),
      surfaceId: datasetValue(candidate, "surfaceId"),
      surfaceKind: datasetValue(candidate, "surfaceKind"),
      visible: datasetValue(candidate, "visible"),
    };
  }

  function paneHostState(host) {
    const rect = host.getBoundingClientRect();
    const width = elementSize(host, "width", rect.width);
    const height = elementSize(host, "height", rect.height);
    return {
      aspectRatio: aspectRatio(width, height),
      childSurfaceKinds: Array.from(host.children)
        .filter((child) => child instanceof HTMLElement)
        .map(childSurfaceKind),
      focused: datasetBoolean(host, "focused"),
      height,
      maximized: datasetBoolean(host, "maximized"),
      moving: datasetBoolean(host, "moving"),
      ok: true,
      paneId: datasetValue(host, "paneId"),
      presentationMode: datasetValue(host, "presentationMode"),
      rect: rectSnapshot(rect),
      runtimeState: datasetValue(host, "runtimeState"),
      snapshotBitmapCount: host.querySelectorAll(".workspace-snapshot-bitmap").length,
      snapshotTextureCount: host.querySelectorAll(".workspace-snapshot-texture").length,
      surfaceFrozen: datasetValue(host, "surfaceFrozen"),
      surfaceId: datasetValue(host, "surfaceId"),
      surfaceKind: datasetValue(host, "surfaceKind"),
      surfaceVisible: datasetValue(host, "surfaceVisible"),
      visible: datasetBoolean(host, "visible"),
      width,
    };
  }

  function datasetValue(element, key) {
    if (!(element instanceof HTMLElement)) {
      return "";
    }
    return element.dataset[key] ?? "";
  }

  function datasetBoolean(element, key) {
    return datasetValue(element, key) === "true";
  }

  function elementSize(element, property, fallback) {
    const value = Number.parseFloat(element.style[property] || "0");
    if (value > 0) {
      return value;
    }
    return fallback;
  }

  function aspectRatio(width, height) {
    if (height <= 0) {
      return 0;
    }
    return width / height;
  }

  function rectSnapshot(rect) {
    return {
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width,
    };
  }

  function childSurfaceKind(child) {
    return child.dataset.surfaceKind ?? child.getAttribute("data-react-surface-kind") ?? "";
  }

  function overviewTransitionTarget(buttonLabel) {
    const area = document.querySelector(workspaceLayoutSelector);
    const button = document.querySelector(`button[aria-label="${cssEscape(buttonLabel)}"]`);
    if (!(area instanceof HTMLElement)) {
      return { ok: false, reason: "missing-workspace-area" };
    }
    if (!(button instanceof HTMLButtonElement)) {
      return { buttonLabel, ok: false, reason: "missing-overview-button" };
    }
    return { area, button, ok: true };
  }

  function workspaceMetricRequirementFailure(requireWorkspaceFrameMetrics, metricsBefore) {
    if (requireWorkspaceFrameMetrics && metricsBefore === null) {
      return { ok: false, reason: "missing-workspace-frame-metrics" };
    }
    return null;
  }

  function startTransitionMeasurement(readMetrics, includeMetricSamples, area) {
    const startedAt = performance.now();
    const frames = [];
    const longTasks = [];
    const longTaskObserver = observeLongTasks(longTasks);
    const metricSamples = [];
    const runtimeStateSamples = [];
    let previousTimestamp = startedAt;
    let running = true;
    function recordFrame(timestamp) {
      if (!running) {
        return;
      }
      frames.push(timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      if (includeMetricSamples) {
        metricSamples.push(readMetrics());
      }
      runtimeStateSamples.push(runtimeStatesForPaneHosts());
      requestAnimationFrame(recordFrame);
    }
    function stop() {
      running = false;
      longTaskObserver?.disconnect();
    }
    return {
      frames,
      initialMode: area.dataset.presentationMode ?? "",
      longTasks,
      metricSamples,
      recordFrame,
      runtimeStateSamples,
      startedAt,
      stop,
    };
  }

  function observeLongTasks(longTasks) {
    if (!longTaskObserverSupported()) {
      return null;
    }
    const observer = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        longTasks.push({ duration: entry.duration, startTime: entry.startTime });
      }
    });
    observer.observe({ type: "longtask" });
    return observer;
  }

  function longTaskObserverSupported() {
    return (
      "PerformanceObserver" in window &&
      PerformanceObserver.supportedEntryTypes.includes("longtask")
    );
  }

  async function maybeRecordNativeBrowserStats(enabled, samples, phase) {
    if (!enabled) {
      return;
    }
    await recordNativeBrowserStats(samples, phase);
  }

  function overviewTransitionResult({ area, measurement, name }) {
    const samples = measurement.frames
      .slice(1)
      .filter((value) => Number.isFinite(value) && value >= 0);
    const stats = frameStats(samples);
    const sampledLongTasks = measurement.longTasks.filter(
      (entry) => entry.startTime >= measurement.startedAt,
    );
    return {
      averageFps: stats.averageFps,
      averageFrameDeltaMs: stats.averageFrameDeltaMs,
      durationMs: performance.now() - measurement.startedAt,
      finalMode: area.dataset.presentationMode ?? "",
      frameCount: samples.length,
      framesMs: samples.map((value) => Number(value.toFixed(3))),
      initialMode: measurement.initialMode,
      longTaskCount: sampledLongTasks.length,
      longTaskTotalMs: sampledLongTasks.reduce((total, entry) => total + entry.duration, 0),
      maxFrameDeltaMs: stats.maxFrameDeltaMs,
      maxRuntimeStatesDuringTransition: maxRuntimeStates(measurement.runtimeStateSamples),
      name,
      observedFrameBudgetMs: stats.observedFrameBudgetMs,
      ok: true,
      p50FrameDeltaMs: stats.p50FrameDeltaMs,
      p95FrameDeltaMs: stats.p95FrameDeltaMs,
      p99FrameDeltaMs: stats.p99FrameDeltaMs,
      runtimeStates: runtimeStatesForPaneHosts(),
      slowFramesOver120HzBudget: samples.filter((value) => value > 8.33).length,
      slowFramesOver16Ms: samples.filter((value) => value > 16.67).length,
      slowFramesOver32Ms: samples.filter((value) => value > 32).length,
      slowFramesOver50Ms: samples.filter((value) => value > 50).length,
    };
  }

  function addWorkspaceMetrics(result, enabled, metrics) {
    if (!enabled) {
      return;
    }
    Object.assign(result, metrics);
  }

  function addNativeBrowserStats(result, enabled, nativeBrowserStats) {
    if (!enabled) {
      return;
    }
    result.nativeBrowserStats = nativeBrowserStats;
  }

  async function recordNativeBrowserStats(samples, phase) {
    const api = window.setta?.workspaceNativeViews;
    if (!api?.readBrowserViewStats) {
      samples.push({ phase, stats: null });
      return;
    }
    samples.push({ phase, stats: await api.readBrowserViewStats() });
  }

  function runtimeStatesForPaneHosts() {
    return Array.from(document.querySelectorAll(".workspace-pane-host")).reduce((states, host) => {
      const state =
        host instanceof HTMLElement ? (host.dataset.runtimeState ?? "unknown") : "unknown";
      states[state] = (states[state] ?? 0) + 1;
      return states;
    }, {});
  }

  function maxRuntimeStates(samples) {
    return samples.reduce((maxStates, states) => {
      for (const [state, count] of Object.entries(states)) {
        maxStates[state] = Math.max(maxStates[state] ?? 0, count);
      }
      return maxStates;
    }, {});
  }

  function frameStats(samples) {
    const sorted = [...samples].sort((left, right) => left - right);
    const p50FrameDeltaMs = quantile(sorted, 0.5);
    const averageFrameDeltaMs =
      samples.length > 0 ? samples.reduce((total, value) => total + value, 0) / samples.length : 0;
    return {
      averageFps: averageFrameDeltaMs > 0 ? 1000 / averageFrameDeltaMs : 0,
      averageFrameDeltaMs,
      maxFrameDeltaMs: sorted.at(-1) ?? 0,
      observedFrameBudgetMs: p50FrameDeltaMs <= 10 ? 8.33 : 16.67,
      p50FrameDeltaMs,
      p95FrameDeltaMs: quantile(sorted, 0.95),
      p99FrameDeltaMs: quantile(sorted, 0.99),
    };
  }

  function quantile(sorted, percentile) {
    if (sorted.length === 0) {
      return 0;
    }
    const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentile));
    return sorted[index];
  }

  function cssEscape(value) {
    if (globalThis.CSS?.escape) {
      return globalThis.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, "\\$&");
  }

  installOverviewPerformanceDriver();
})();
