/* global CSS, Event, HTMLButtonElement, HTMLCanvasElement, HTMLElement, HTMLInputElement, HTMLSelectElement, MutationObserver, PerformanceObserver, WheelEvent, document, performance, requestAnimationFrame, window */

(() => {
  const version = "setta-director-command-center-performance-driver-v3";
  let activeProfiler = null;

  function installDirectorCommandCenterPerformanceDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      directorCommandCenterAnswerApproval,
      directorCommandCenterCanvasPixelCheck,
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
    const workstreamStrip = document.querySelector(".director-workstream-strip");
    const dots = Array.from(document.querySelectorAll(".director-workstream-dot"));
    return {
      activityItems: document.querySelectorAll(".director-activity-item").length,
      artifactCards: document.querySelectorAll("[data-artifact-id]").length,
      artifactDetailOpen: Boolean(document.querySelector(".director-artifact-detail")),
      bodyDescendantCount: document.body.querySelectorAll("*").length,
      composerPresent: Boolean(document.querySelector("#director-composer-input")),
      graph: elementBox(graph),
      graphCanvasBacking: {
        height: canvas instanceof HTMLCanvasElement ? canvas.height : 0,
        width: canvas instanceof HTMLCanvasElement ? canvas.width : 0,
      },
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
      workstreamStrip: workstreamStripSnapshot(workstreamStrip, dots),
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

  function directorCommandCenterCanvasPixelCheck() {
    const canvas = document.querySelector(".director-graph-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return { available: false, digest: "", litPixelRatio: 0, ok: false, peakLuminance: 0 };
    }
    const gl = canvas.getContext("webgl2");
    if (!gl || gl.drawingBufferWidth === 0 || gl.drawingBufferHeight === 0) {
      return { available: false, digest: "", litPixelRatio: 0, ok: false, peakLuminance: 0 };
    }
    // The graph host handles wheel input synchronously and schedules its draw
    // before this callback. Read in that same animation frame because the
    // production context deliberately does not preserve its drawing buffer.
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 0 }));
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        const pixels = new Uint8Array(width * height * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        resolve(graphPixelSnapshot(pixels, width, height));
      });
    });
  }

  function createProfiler() {
    const startedAt = performance.now();
    const startHeapBytes = usedHeapBytes();
    let peakHeapBytes = startHeapBytes;
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
      const heapBytes = usedHeapBytes();
      if (heapBytes !== null) {
        peakHeapBytes = Math.max(peakHeapBytes ?? 0, heapBytes);
      }
      previousTimestamp = timestamp;
      requestAnimationFrame(recordFrame);
    }

    function stop() {
      running = false;
      longTaskObserver?.disconnect();
      mutationObserver.disconnect();
      return frameSample(
        startedAt,
        frames,
        longTasks,
        mutations,
        startHeapBytes,
        peakHeapBytes,
        usedHeapBytes(),
      );
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

  function frameSample(
    startedAt,
    frames,
    longTasks,
    mutations,
    startHeapBytes,
    peakHeapBytes,
    endHeapBytes,
  ) {
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
      heap: {
        endBytes: endHeapBytes,
        peakBytes: peakHeapBytes,
        startBytes: startHeapBytes,
      },
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

  function graphPixelSnapshot(pixels, width, height) {
    const columns = 32;
    const rows = 32;
    const minimumSparseGraphLitCellRatio = 2 / (columns * rows);
    const minimumSparseGraphPeakCellLuminance = 0.03;
    const grid = sampleGraphPixelGrid(pixels, width, height, columns, rows);
    const peakLuminance = normalizeGraphPixelCells(grid.cellLuminance, grid.cellCounts);
    const litPixelRatio = graphPixelLitCellRatio(grid.cellLuminance, peakLuminance);
    return {
      available: true,
      digest: grid.digest.toString(16).padStart(8, "0"),
      litPixelRatio,
      // Live command-center graphs can contain one sparse active trajectory;
      // the dense deterministic gallery's mean-cell threshold is not valid for
      // them. Peak energy plus occupied cells distinguishes a presented graph
      // from the cleared non-preserved buffer (both values are zero there).
      ok: sparseGraphPixelsPresent({
        litPixelRatio,
        minimumSparseGraphLitCellRatio,
        minimumSparseGraphPeakCellLuminance,
        peakLuminance,
        peakPixelLuminance: grid.peakPixelLuminance,
      }),
      peakLuminance,
      peakPixelLuminance: grid.peakPixelLuminance,
    };
  }

  function sampleGraphPixelGrid(pixels, width, height, columns, rows) {
    const cellLuminance = new Array(columns * rows).fill(0);
    const cellCounts = new Uint32Array(columns * rows);
    const stride = graphPixelSampleStride(width, height);
    let digest = 2_166_136_261;
    let peakPixelLuminance = 0;
    for (let y = 0; y < height; y += stride) {
      const row = Math.min(rows - 1, Math.floor((y / height) * rows));
      for (let x = 0; x < width; x += stride) {
        const column = Math.min(columns - 1, Math.floor((x / width) * columns));
        const offset = (y * width + x) * 4;
        const red = pixels[offset] ?? 0;
        const green = pixels[offset + 1] ?? 0;
        const blue = pixels[offset + 2] ?? 0;
        const alpha = pixels[offset + 3] ?? 0;
        const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
        const cell = row * columns + column;
        cellLuminance[cell] += luminance;
        cellCounts[cell] += 1;
        peakPixelLuminance = Math.max(peakPixelLuminance, luminance);
        digest = hashPixelByte(digest, red);
        digest = hashPixelByte(digest, green);
        digest = hashPixelByte(digest, blue);
        digest = hashPixelByte(digest, alpha);
      }
    }
    return { cellCounts, cellLuminance, digest, peakPixelLuminance };
  }

  function graphPixelSampleStride(width, height) {
    return Math.max(1, Math.floor(Math.sqrt((width * height) / 400_000)));
  }

  function normalizeGraphPixelCells(cellLuminance, cellCounts) {
    let peakLuminance = 0;
    for (let index = 0; index < cellLuminance.length; index += 1) {
      const count = cellCounts[index] ?? 0;
      cellLuminance[index] = count === 0 ? 0 : (cellLuminance[index] ?? 0) / count;
      peakLuminance = Math.max(peakLuminance, cellLuminance[index] ?? 0);
    }
    return peakLuminance;
  }

  function graphPixelLitCellRatio(cellLuminance, peakLuminance) {
    const litThreshold = Math.max(0.01, peakLuminance * 0.1);
    return cellLuminance.filter((value) => value >= litThreshold).length / cellLuminance.length;
  }

  function sparseGraphPixelsPresent({
    litPixelRatio,
    minimumSparseGraphLitCellRatio,
    minimumSparseGraphPeakCellLuminance,
    peakLuminance,
    peakPixelLuminance,
  }) {
    return (
      peakPixelLuminance >= 0.1 &&
      peakLuminance >= minimumSparseGraphPeakCellLuminance &&
      litPixelRatio >= minimumSparseGraphLitCellRatio
    );
  }

  function hashPixelByte(digest, value) {
    return Math.imul(digest ^ value, 16_777_619) >>> 0;
  }

  function usedHeapBytes() {
    const memory = performance.memory;
    return typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize : null;
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

  function workstreamStripSnapshot(strip, dots) {
    if (!(strip instanceof HTMLElement)) {
      return {
        allDotsVisible: false,
        clientWidth: 0,
        present: false,
        scrollWidth: 0,
        selectedDotVisible: false,
      };
    }
    const stripBox = strip.getBoundingClientRect();
    const dotVisibility = dots.map((dot) => {
      if (!(dot instanceof HTMLElement)) {
        return false;
      }
      const dotBox = dot.getBoundingClientRect();
      return dotBox.left >= stripBox.left - 1 && dotBox.right <= stripBox.right + 1;
    });
    const selectedIndex = dots.findIndex(
      (dot) => dot instanceof HTMLElement && dot.getAttribute("aria-current") === "page",
    );
    return {
      allDotsVisible: dotVisibility.every(Boolean),
      clientWidth: strip.clientWidth,
      present: true,
      scrollWidth: strip.scrollWidth,
      selectedDotVisible: selectedIndex >= 0 && dotVisibility[selectedIndex] === true,
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
