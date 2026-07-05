/* global HTMLElement, MutationObserver, PerformanceObserver, document, performance, requestAnimationFrame, window */

(() => {
  const version = "setta-chat-stream-performance-driver-v1";
  const transcriptScrollerSelector = '[data-testid="chat-transcript-scroller"]';

  function installChatStreamPerformanceDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      chatStreamPerformanceSnapshot,
      chatStreamPerformanceStart,
      chatStreamPerformanceVersion: version,
    });
  }

  function chatStreamPerformanceStart({ completionMarker, settleAfterCompletionMs }) {
    const detailPane = document.querySelector('[data-testid="chat-detail-pane"]');
    if (!(detailPane instanceof HTMLElement)) {
      return { ok: false, reason: "missing-chat-detail-pane" };
    }
    window.__settaChatStreamPerformance?.stop?.();
    const frames = [];
    const longTasks = [];
    let mutationCount = 0;
    let completionAt = null;
    let running = true;
    let settledAt = null;
    const startedAt = performance.now();
    let previousFrameTimestamp = startedAt;
    let longTaskObserver = null;
    if (
      "PerformanceObserver" in window &&
      PerformanceObserver.supportedEntryTypes.includes("longtask")
    ) {
      longTaskObserver = new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
          longTasks.push({ duration: entry.duration, startTime: entry.startTime });
        }
      });
      longTaskObserver.observe({ type: "longtask" });
    }
    const mutationObserver = new MutationObserver((records) => {
      mutationCount += records.length;
      markCompletionIfVisible();
    });
    mutationObserver.observe(detailPane, {
      characterData: true,
      childList: true,
      subtree: true,
    });

    function recordFrame(timestamp) {
      if (!running) {
        return;
      }
      frames.push(timestamp - previousFrameTimestamp);
      previousFrameTimestamp = timestamp;
      requestAnimationFrame(recordFrame);
    }

    function markCompletionIfVisible() {
      if (completionAt !== null || !detailPane.textContent?.includes(completionMarker)) {
        return;
      }
      completionAt = performance.now();
      window.setTimeout(stop, settleAfterCompletionMs);
    }

    function stop() {
      if (!running) {
        return;
      }
      running = false;
      settledAt = performance.now();
      mutationObserver.disconnect();
      longTaskObserver?.disconnect();
    }

    function snapshot() {
      markCompletionIfVisible();
      const endedAt = settledAt ?? performance.now();
      const samples = frames.slice(1).filter((value) => Number.isFinite(value) && value >= 0);
      const stats = frameStats(samples);
      const measurementLongTasks = longTasks.filter((entry) => entry.startTime >= startedAt);
      return {
        averageFps: stats.averageFps,
        averageFrameDeltaMs: stats.averageFrameDeltaMs,
        bodyTextLength: document.body.textContent?.length ?? 0,
        completionAtMs: completionAt === null ? null : completionAt - startedAt,
        completionVisible: completionAt !== null,
        durationMs: endedAt - startedAt,
        frameCount: samples.length,
        framesMs: samples.map((value) => Number(value.toFixed(3))),
        longTaskCount: measurementLongTasks.length,
        longTaskMaxMs: measurementLongTasks.reduce(
          (maxValue, entry) => Math.max(maxValue, entry.duration),
          0,
        ),
        longTaskTotalMs: measurementLongTasks.reduce((total, entry) => total + entry.duration, 0),
        longTasks: measurementLongTasks.map((entry) => ({
          duration: Number(entry.duration.toFixed(3)),
          startTime: Number((entry.startTime - startedAt).toFixed(3)),
        })),
        maxFrameDeltaMs: stats.maxFrameDeltaMs,
        mutationCount,
        observedFrameBudgetMs: stats.observedFrameBudgetMs,
        ok: true,
        p50FrameDeltaMs: stats.p50FrameDeltaMs,
        p95FrameDeltaMs: stats.p95FrameDeltaMs,
        p99FrameDeltaMs: stats.p99FrameDeltaMs,
        scroller: scrollerState(),
        settled: !running && completionAt !== null,
        slowFramesOver120HzBudget: samples.filter((value) => value > 8.33).length,
        slowFramesOver16Ms: samples.filter((value) => value > 16.67).length,
        slowFramesOver24Ms: samples.filter((value) => value > 24).length,
        slowFramesOver32Ms: samples.filter((value) => value > 32).length,
        slowFramesOver50Ms: samples.filter((value) => value > 50).length,
        slowFramesOverDoubleObservedBudget: samples.filter(
          (value) => value > stats.observedFrameBudgetMs * 2,
        ).length,
        transcriptBlockCount: document.querySelectorAll("[data-transcript-block]").length,
        transcriptMessageRowCount: document.querySelectorAll('[data-chat-message="true"]').length,
      };
    }

    window.__settaChatStreamPerformance = { snapshot, stop };
    requestAnimationFrame(recordFrame);
    return { ok: true };
  }

  function chatStreamPerformanceSnapshot() {
    if (!window.__settaChatStreamPerformance?.snapshot) {
      return { ok: false, reason: "missing-measurement" };
    }
    return window.__settaChatStreamPerformance.snapshot();
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

  function scrollerState() {
    const scroller = document.querySelector(transcriptScrollerSelector);
    if (!(scroller instanceof HTMLElement)) {
      return null;
    }
    return {
      atBottom: Math.abs(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight) <= 2,
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
      scrollTop: scroller.scrollTop,
    };
  }

  installChatStreamPerformanceDriver();
})();
