/* global Event, HTMLButtonElement, HTMLElement, MutationObserver, PerformanceObserver, document, performance, requestAnimationFrame, window */

(() => {
  const version = "setta-chat-long-transcript-performance-driver-v1";
  const transcriptScrollerSelector = '[data-testid="chat-transcript-scroller"]';

  function installChatLongTranscriptPerformanceDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      chatLongTranscriptBodyText,
      chatLongTranscriptClickOlderButtonAtTop,
      chatLongTranscriptClickPerformanceConversation,
      chatLongTranscriptPerformanceVersion: version,
      chatLongTranscriptPrepareScrollStart,
      chatLongTranscriptStartSampler,
      chatLongTranscriptState,
      chatLongTranscriptStopSampler,
      chatLongTranscriptTopState,
    });
  }

  function chatLongTranscriptBodyText() {
    return document.body.innerText;
  }

  function chatLongTranscriptClickPerformanceConversation() {
    const target = Array.from(document.querySelectorAll('button, [role="button"], a')).find(
      (element) => (element.textContent || "").includes("Performance Long Chat"),
    );
    if (!target) {
      return { ok: false, reason: "missing-conversation" };
    }
    target.click();
    return { ok: true };
  }

  async function chatLongTranscriptClickOlderButtonAtTop() {
    const scroller = chatTranscriptScroller();
    if (!scroller) {
      return { ok: false, reason: "missing-scroller" };
    }
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    await nextFrame();
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "Older",
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, reason: "missing-older-button" };
    }
    button.click();
    return { ok: true };
  }

  function chatLongTranscriptPrepareScrollStart({ start }) {
    const scroller = chatTranscriptScroller();
    if (!scroller) {
      return { ok: false, reason: "missing-scroller" };
    }
    scroller.scrollTop =
      start === "bottom" ? Math.max(0, scroller.scrollHeight - scroller.clientHeight) : 0;
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    const rect = scroller.getBoundingClientRect();
    return {
      ok: true,
      startScrollTop: scroller.scrollTop,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    };
  }

  async function chatLongTranscriptTopState() {
    const scroller = chatTranscriptScroller();
    if (scroller) {
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      await nextFrame();
    }
    return chatLongTranscriptState();
  }

  function chatLongTranscriptState() {
    const scroller = chatTranscriptScroller();
    const detailPane = document.querySelector('[data-testid="chat-detail-pane"]');
    const messageIds = visibleMessageIds();
    const turnIndexes = visibleTurnIndexes(messageIds);
    const olderButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Older",
    );
    const activity = visibleActivityCounts();
    const turns = visibleTurnRange(turnIndexes);
    return {
      bodyTextLength: document.body.textContent?.length ?? 0,
      hasOlderButton: olderButton instanceof HTMLButtonElement && !olderButton.disabled,
      maxVisibleTurn: turns.maxVisibleTurn,
      messageRows: messageIds.length,
      selectedConversationId:
        detailPane instanceof HTMLElement ? (detailPane.dataset.conversationId ?? "") : "",
      ...scrollerSnapshot(scroller),
      topTurn: turns.topTurn,
      turnRows: document.querySelectorAll('[data-testid="chat-transcript-turn"]').length,
      ...activity,
    };
  }

  function visibleMessageIds() {
    return Array.from(document.querySelectorAll('[data-chat-message="true"]'))
      .map((row) => (row instanceof HTMLElement ? (row.dataset.messageId ?? "") : ""))
      .filter((id) => id !== "");
  }

  function visibleTurnIndexes(messageIds) {
    return messageIds
      .map((id) => {
        const match = id.match(/message_performance_(?:user|assistant|steering)_(\d+)/);
        return match ? Number(match[1]) : null;
      })
      .filter((value) => Number.isFinite(value));
  }

  function visibleTurnRange(turnIndexes) {
    if (turnIndexes.length === 0) {
      return { maxVisibleTurn: null, topTurn: null };
    }
    return {
      maxVisibleTurn: Math.max(...turnIndexes),
      topTurn: Math.min(...turnIndexes),
    };
  }

  function visibleActivityCounts() {
    const visibleActivityRows = document.querySelectorAll(
      '[data-testid="run-activity-row"]',
    ).length;
    const visibleActivityGroups = document.querySelectorAll(
      '[data-testid="activity-group-header"]',
    ).length;
    return {
      visibleActivityGroups,
      visibleActivityRows: visibleActivityRows + visibleActivityGroups,
    };
  }

  function scrollerSnapshot(scroller) {
    if (!scroller) {
      return {
        atBottom: false,
        clientHeight: 0,
        ready: false,
        scrollHeight: 0,
        scrollTop: 0,
      };
    }
    return {
      atBottom: Math.abs(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight) <= 2,
      clientHeight: scroller.clientHeight,
      ready: true,
      scrollHeight: scroller.scrollHeight,
      scrollTop: scroller.scrollTop,
    };
  }

  function chatLongTranscriptStartSampler() {
    window.__settaLongTranscriptPerfStop?.();
    const startedAt = performance.now();
    const frames = [];
    const longTasks = [];
    let mutationCount = 0;
    let previousTimestamp = startedAt;
    let running = true;
    let observer = null;
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
    const scroller = chatTranscriptScroller();
    if (!scroller) {
      return { ok: false, reason: "missing-scroller" };
    }
    const mutationObserver = new MutationObserver((records) => {
      mutationCount += records.length;
    });
    mutationObserver.observe(scroller, {
      characterData: true,
      childList: true,
      subtree: true,
    });

    function recordFrame(timestamp) {
      if (!running) {
        return;
      }
      frames.push(timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      requestAnimationFrame(recordFrame);
    }

    requestAnimationFrame(recordFrame);
    window.__settaLongTranscriptPerfStop = () => {
      running = false;
      observer?.disconnect();
      mutationObserver.disconnect();
      window.__settaLongTranscriptPerfStop = null;
      const samples = frames.slice(1).filter((value) => Number.isFinite(value) && value >= 0);
      const sorted = [...samples].sort((left, right) => left - right);
      const averageFrameDeltaMs =
        samples.length > 0
          ? samples.reduce((total, value) => total + value, 0) / samples.length
          : 0;
      const observedFrameBudgetMs = quantile(sorted, 0.5) <= 10 ? 8.33 : 16.67;
      const sampledLongTasks = longTasks.filter((entry) => entry.startTime >= startedAt);
      return {
        averageFps: averageFrameDeltaMs > 0 ? 1000 / averageFrameDeltaMs : 0,
        averageFrameDeltaMs,
        durationMs: performance.now() - startedAt,
        frameCount: samples.length,
        framesMs: samples.map((value) => Number(value.toFixed(3))),
        longTaskCount: sampledLongTasks.length,
        longTaskMaxMs: sampledLongTasks.reduce(
          (maxValue, entry) => Math.max(maxValue, entry.duration),
          0,
        ),
        longTaskTotalMs: sampledLongTasks.reduce((total, entry) => total + entry.duration, 0),
        longTasks: sampledLongTasks.map((entry) => ({
          duration: Number(entry.duration.toFixed(3)),
          startTime: Number((entry.startTime - startedAt).toFixed(3)),
        })),
        maxFrameDeltaMs: sorted.at(-1) ?? 0,
        mutationCount,
        observedFrameBudgetMs,
        p50FrameDeltaMs: quantile(sorted, 0.5),
        p95FrameDeltaMs: quantile(sorted, 0.95),
        p99FrameDeltaMs: quantile(sorted, 0.99),
        slowFramesOver120HzBudget: samples.filter((value) => value > 8.33).length,
        slowFramesOver16Ms: samples.filter((value) => value > 16.67).length,
        slowFramesOver32Ms: samples.filter((value) => value > 32).length,
        slowFramesOver50Ms: samples.filter((value) => value > 50).length,
      };
    };
    return { ok: true };
  }

  function chatLongTranscriptStopSampler() {
    if (!window.__settaLongTranscriptPerfStop) {
      return { ok: false, reason: "missing-sampler" };
    }
    return { ok: true, sample: window.__settaLongTranscriptPerfStop() };
  }

  function chatTranscriptScroller() {
    const scroller = document.querySelector(transcriptScrollerSelector);
    return scroller instanceof HTMLElement ? scroller : null;
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function quantile(sorted, percentile) {
    if (sorted.length === 0) {
      return 0;
    }
    const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentile));
    return sorted[index];
  }

  installChatLongTranscriptPerformanceDriver();
})();
