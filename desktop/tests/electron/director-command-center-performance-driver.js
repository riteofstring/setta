/* global CSS, Event, HTMLButtonElement, HTMLElement, HTMLInputElement, HTMLSelectElement, MutationObserver, PerformanceObserver, document, performance, requestAnimationFrame, window */

(() => {
  const version = "setta-director-command-center-performance-driver-v1";
  let activeProfiler = null;

  function installDirectorCommandCenterPerformanceDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      directorCommandCenterAnswerApproval,
      directorCommandCenterOpenArtifact,
      directorCommandCenterPerformanceSnapshot,
      directorCommandCenterPerformanceStart,
      directorCommandCenterPerformanceStop,
      directorCommandCenterPerformanceVersion: version,
      directorCommandCenterWaitFrames,
    });
  }

  function directorCommandCenterPerformanceStart() {
    if (activeProfiler) {
      return { ok: false, reason: "already-running" };
    }
    activeProfiler = createProfiler();
    requestAnimationFrame(activeProfiler.recordFrame);
    return { initial: directorCommandCenterPerformanceSnapshot(), ok: true };
  }

  function directorCommandCenterPerformanceStop() {
    if (!activeProfiler) {
      return { ok: false, reason: "not-running" };
    }
    const profiler = activeProfiler;
    activeProfiler = null;
    return {
      final: directorCommandCenterPerformanceSnapshot(),
      ok: true,
      sample: profiler.stop(),
    };
  }

  async function directorCommandCenterWaitFrames({ count }) {
    const frameCount = positiveInteger(count, "count");
    for (let index = 0; index < frameCount; index += 1) {
      await nextFrame();
    }
    return { frames: frameCount, ok: true };
  }

  function directorCommandCenterPerformanceSnapshot() {
    const shell = document.querySelector('[data-testid="director-command-center-shell"]');
    const topBar = document.querySelector('[data-testid="director-command-center-top-bar"]');
    const graph = document.querySelector(".director-graph-surface");
    const canvas = document.querySelector(".director-graph-canvas");
    const nowRail = document.querySelector("#director-now-rail");
    const artifactsRail = document.querySelector("#director-artifacts-rail");
    const dots = Array.from(document.querySelectorAll(".director-workstream-dot"));
    return {
      artifactCards: document.querySelectorAll("[data-artifact-id]").length,
      artifactDetailOpen: Boolean(document.querySelector(".director-artifact-detail")),
      bodyDescendantCount: document.body.querySelectorAll("*").length,
      composerPresent: Boolean(document.querySelector("#director-composer-input")),
      graph: elementBox(graph),
      graphCanvas: elementBox(canvas),
      graphLabelCount: document.querySelectorAll(".director-graph-label").length,
      historyItems: document.querySelectorAll(".director-history-list li").length,
      pendingApprovals: document.querySelectorAll("[data-approval-id]").length,
      pendingResourceRequests: document.querySelectorAll("[data-resource-request-id]").length,
      rails: {
        artifacts: railSnapshot(artifactsRail),
        now: railSnapshot(nowRail),
      },
      shell: elementBox(shell),
      shellPresent: shell instanceof HTMLElement,
      topBar: elementBox(topBar),
      visibleWorkstreamDotCount: dots.length,
      visibleWorkstreams: dots.map((dot) => ({
        current: dot.getAttribute("aria-current") === "page",
        id: dot instanceof HTMLElement ? (dot.dataset.workstreamId ?? "") : "",
        status: dot instanceof HTMLElement ? (dot.dataset.status ?? "") : "",
      })),
    };
  }

  function directorCommandCenterAnswerApproval({ answer, approvalId, questionId }) {
    const approval = elementByDataId("approval", approvalId);
    if (!(approval instanceof HTMLElement)) {
      return { ok: false, reason: "missing-approval" };
    }
    const field = approval.querySelector(`[name="${cssEscape(questionId)}"]`);
    if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLSelectElement)) {
      return { ok: false, reason: "missing-question" };
    }
    setFieldValue(field, answer);
    const button = enabledButtonByText(approval, "Answer");
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-answer-button" };
    }
    button.click();
    return { ok: true };
  }

  function directorCommandCenterOpenArtifact({ artifactId }) {
    const artifact = Array.from(document.querySelectorAll("button[data-artifact-id]")).find(
      (candidate) =>
        candidate instanceof HTMLButtonElement &&
        candidate.getAttribute("data-artifact-id") === artifactId,
    );
    if (!(artifact instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-artifact" };
    }
    if (artifact.disabled) {
      return { ok: false, reason: "disabled-artifact" };
    }
    artifact.click();
    return { ok: true };
  }

  function createProfiler() {
    const startedAt = performance.now();
    const frames = [];
    const longTasks = [];
    const mutations = emptyMutationCounts();
    let previousTimestamp = startedAt;
    let running = true;
    let warmupFrames = 3;
    const longTaskObserver = observeLongTasks(longTasks);
    const mutationObserver = observeMutations(mutations);

    function recordFrame(timestamp) {
      if (!running) {
        return;
      }
      if (warmupFrames > 0) {
        warmupFrames -= 1;
      } else {
        frames.push(timestamp - previousTimestamp);
      }
      previousTimestamp = timestamp;
      requestAnimationFrame(recordFrame);
    }

    function stop() {
      running = false;
      longTaskObserver?.disconnect();
      mutationObserver.disconnect();
      return frameSample(startedAt, frames, longTasks, mutations);
    }

    return { recordFrame, stop };
  }

  function observeMutations(mutations) {
    const observer = new MutationObserver((records) => {
      mutations.callbackCount += 1;
      mutations.recordCount += records.length;
      for (const record of records) {
        mutations.addedNodes += record.addedNodes.length;
        mutations.removedNodes += record.removedNodes.length;
        if (record.type === "attributes") {
          mutations.attributeRecords += 1;
        } else if (record.type === "characterData") {
          mutations.characterDataRecords += 1;
        }
      }
    });
    observer.observe(document.body, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    return observer;
  }

  function observeLongTasks(longTasks) {
    if (
      !("PerformanceObserver" in window) ||
      !PerformanceObserver.supportedEntryTypes.includes("longtask")
    ) {
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

  function frameSample(startedAt, frames, longTasks, mutations) {
    const samples = frames.filter((value) => Number.isFinite(value) && value >= 0);
    const sorted = [...samples].sort((left, right) => left - right);
    const averageFrameDeltaMs = average(samples);
    const sampledLongTasks = longTasks.filter((entry) => entry.startTime >= startedAt);
    return {
      averageFps: averageFrameDeltaMs > 0 ? 1000 / averageFrameDeltaMs : 0,
      averageFrameDeltaMs,
      durationMs: performance.now() - startedAt,
      frameCount: samples.length,
      framesMs: samples.map((value) => Number(value.toFixed(3))),
      longTaskCount: sampledLongTasks.length,
      longTaskMaxMs: maximum(sampledLongTasks.map((entry) => entry.duration)),
      longTaskTotalMs: sampledLongTasks.reduce((total, entry) => total + entry.duration, 0),
      maxFrameDeltaMs: maximum(sorted),
      mutations,
      observedFrameBudgetMs: quantile(sorted, 0.5) <= 10 ? 8.33 : 16.67,
      p50FrameDeltaMs: quantile(sorted, 0.5),
      p95FrameDeltaMs: quantile(sorted, 0.95),
      p99FrameDeltaMs: quantile(sorted, 0.99),
      slowFramesOver120HzBudget: samples.filter((value) => value > 8.33).length,
      slowFramesOver16Ms: samples.filter((value) => value > 16.67).length,
      slowFramesOver32Ms: samples.filter((value) => value > 32).length,
      slowFramesOver50Ms: samples.filter((value) => value > 50).length,
    };
  }

  function elementByDataId(kind, value) {
    return document.querySelector(`[data-${kind}-id="${cssEscape(value)}"]`);
  }

  function enabledButtonByText(root, text) {
    return Array.from(root.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === text && !button.disabled,
    );
  }

  function setFieldValue(field, value) {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value");
    descriptor?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function railSnapshot(rail) {
    return {
      descendantCount: rail instanceof HTMLElement ? rail.querySelectorAll("*").length : 0,
      present: rail instanceof HTMLElement,
      visible: rail instanceof HTMLElement && visibleElement(rail),
    };
  }

  function elementBox(element) {
    if (!(element instanceof HTMLElement)) {
      return { height: 0, present: false, visible: false, width: 0 };
    }
    return {
      height: Math.round(element.getBoundingClientRect().height),
      present: true,
      visible: visibleElement(element),
      width: Math.round(element.getBoundingClientRect().width),
    };
  }

  function visibleElement(element) {
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" && style.visibility !== "hidden" && element.offsetParent !== null
    );
  }

  function positiveInteger(value, label) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${label} must be a positive integer: ${String(value)}`);
    }
    return value;
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function emptyMutationCounts() {
    return {
      addedNodes: 0,
      attributeRecords: 0,
      callbackCount: 0,
      characterDataRecords: 0,
      recordCount: 0,
      removedNodes: 0,
    };
  }

  function average(values) {
    return values.length > 0
      ? values.reduce((total, value) => total + value, 0) / values.length
      : 0;
  }

  function maximum(values) {
    return values.length > 0 ? Math.max(...values) : 0;
  }

  function quantile(sorted, percentile) {
    if (sorted.length === 0) {
      return 0;
    }
    const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentile));
    return sorted[index];
  }

  function cssEscape(value) {
    return CSS.escape(String(value));
  }

  installDirectorCommandCenterPerformanceDriver();
})();
