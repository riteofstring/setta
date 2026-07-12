/* global Event, HTMLElement, HTMLInputElement, MutationObserver, PerformanceObserver, document, performance, requestAnimationFrame, window */

(() => {
  const version = "setta-topic-conversation-performance-driver-v2";
  let activeProfiler = null;

  function installTopicConversationPerformanceDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      topicConversationNavigatorLoadMore,
      topicConversationNavigatorScroll,
      topicConversationNavigatorSnapshot,
      topicConversationPerformanceSnapshot,
      topicConversationPerformanceStart,
      topicConversationPerformanceStop,
      topicConversationPerformanceVersion: version,
    });
  }

  function topicConversationPerformanceStart() {
    if (activeProfiler) {
      return { ok: false, reason: "already-running" };
    }
    activeProfiler = createProfiler();
    requestAnimationFrame(activeProfiler.recordFrame);
    return { initial: topicConversationPerformanceSnapshot(), ok: true };
  }

  function topicConversationPerformanceStop() {
    if (!activeProfiler) {
      return { ok: false, reason: "not-running" };
    }
    const profiler = activeProfiler;
    activeProfiler = null;
    return {
      final: topicConversationPerformanceSnapshot(),
      ok: true,
      sample: profiler.stop(),
    };
  }

  function topicConversationPerformanceSnapshot() {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const surfaces = Array.from(document.querySelectorAll('[data-testid="easy-button-surface"]'))
      .filter(
        (surface) =>
          surface instanceof HTMLElement &&
          surface.closest(".workspace-frozen-dom-visual, .workspace-snapshot-texture") === null,
      )
      .map(profiledSurface);
    return {
      bodyDescendantCount: document.body.querySelectorAll("*").length,
      frozenVisualCount: document.querySelectorAll(".workspace-frozen-dom-visual").length,
      paneCount: area instanceof HTMLElement ? Number(area.dataset.paneCount ?? "0") : 0,
      snapshotTextureCount: document.querySelectorAll(".workspace-snapshot-texture").length,
      surfaces,
    };
  }

  function topicConversationNavigatorSnapshot() {
    const list = document.querySelector('[data-testid="conversation-navigation-list"]');
    const search = document.querySelector('input[aria-label="Search conversations"]');
    const searchQuery = search instanceof HTMLInputElement ? search.value : "";
    if (!(list instanceof HTMLElement)) {
      return emptyNavigatorSnapshot(searchQuery);
    }
    const renderedItems = list.querySelectorAll(
      '[data-testid="active-workspace-item"], [data-testid="conversation-more-item"], [data-testid="conversation-navigator-row"], [data-testid="conversation-status-item"], [data-testid="recent-workspace-item"]',
    );
    const conversations = Array.from(
      list.querySelectorAll('[data-testid="conversation-navigator-item"]'),
    );
    return {
      bodyDescendantCount: document.body.querySelectorAll("*").length,
      clientHeight: list.clientHeight,
      renderedConversationCount: conversations.length,
      renderedConversations: conversations.map((conversation) => ({
        id: conversation.dataset.conversationId ?? "",
        label: conversation.getAttribute("aria-label") ?? "",
      })),
      renderedConversationIds: conversations.map(
        (conversation) => conversation.dataset.conversationId ?? "",
      ),
      renderedItemCount: renderedItems.length,
      renderedLoadMoreCount: list.querySelectorAll('[data-testid="conversation-more-item"]').length,
      renderedWorkspaceCount: list.querySelectorAll('[data-testid="active-workspace-item"]').length,
      scrollHeight: list.scrollHeight,
      scrollTop: list.scrollTop,
      searchQuery,
    };
  }

  function emptyNavigatorSnapshot(searchQuery) {
    return {
      bodyDescendantCount: document.body.querySelectorAll("*").length,
      clientHeight: 0,
      renderedConversationCount: 0,
      renderedConversations: [],
      renderedConversationIds: [],
      renderedItemCount: 0,
      renderedLoadMoreCount: 0,
      renderedWorkspaceCount: 0,
      scrollHeight: 0,
      scrollTop: 0,
      searchQuery,
    };
  }

  async function topicConversationNavigatorScroll({ ratio }) {
    const list = document.querySelector('[data-testid="conversation-navigation-list"]');
    if (!(list instanceof HTMLElement) || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
      return { ok: false, reason: "invalid-scroll-request" };
    }
    const start = list.scrollTop;
    const target = Math.max(0, list.scrollHeight - list.clientHeight) * ratio;
    const stepCount = 6;
    for (let step = 1; step <= stepCount; step += 1) {
      list.scrollTop = start + (target - start) * (step / stepCount);
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
      await nextFrame();
    }
    return { ok: true, snapshot: topicConversationNavigatorSnapshot() };
  }

  function topicConversationNavigatorLoadMore() {
    const candidate = Array.from(
      document.querySelectorAll('[data-testid="conversation-more-item"] button'),
    ).find((button) => !button.disabled);
    if (!(candidate instanceof HTMLElement)) {
      return { clicked: false };
    }
    candidate.click();
    return { clicked: true };
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function profiledSurface(surface) {
    const host = surface.closest('[data-testid="workspace-pane-host"]');
    return {
      conversationId: surface.dataset.conversationId ?? "",
      descendantCount: surface.querySelectorAll("*").length,
      eventCursorSequence: Number(surface.dataset.easyButtonEventCursor ?? "0"),
      paneId: datasetValue(host, "paneId"),
      projectionStatus: surface.dataset.easyButtonProjection ?? "",
      runtimeState: datasetValue(host, "runtimeState"),
      state: surface.dataset.easyButtonState ?? "",
      trajectoryEventCount: Number(surface.dataset.easyButtonTrajectoryCount ?? "0"),
      trajectoryHasEarlier: surface.dataset.easyButtonTrajectoryHasEarlier === "true",
      visible: datasetValue(host, "visible") === "true",
    };
  }

  function datasetValue(element, key) {
    return element instanceof HTMLElement ? (element.dataset[key] ?? "") : "";
  }

  function createProfiler() {
    const startedAt = performance.now();
    const frames = [];
    const longTasks = [];
    const mutations = {
      addedNodes: 0,
      attributeRecords: 0,
      callbackCount: 0,
      characterDataRecords: 0,
      paletteIdentityAttributeRecords: 0,
      paletteIdentityChanges: 0,
      recordCount: 0,
      removedNodes: 0,
    };
    let previousTimestamp = startedAt;
    let running = true;
    let warmupFrames = 3;
    const longTaskObserver = observeLongTasks(longTasks);
    const mutationObserver = new MutationObserver((records) => {
      mutations.callbackCount += 1;
      mutations.recordCount += records.length;
      for (const record of records) {
        mutations.addedNodes += record.addedNodes.length;
        mutations.removedNodes += record.removedNodes.length;
        if (record.type === "attributes") {
          mutations.attributeRecords += 1;
          if (record.attributeName === "data-conversation-palette") {
            mutations.paletteIdentityAttributeRecords += 1;
            const nextPaletteId =
              record.target instanceof HTMLElement
                ? record.target.getAttribute("data-conversation-palette")
                : null;
            if (
              record.oldValue !== null &&
              nextPaletteId !== null &&
              record.oldValue !== nextPaletteId
            ) {
              mutations.paletteIdentityChanges += 1;
            }
          }
        } else if (record.type === "characterData") {
          mutations.characterDataRecords += 1;
        }
      }
    });
    mutationObserver.observe(document.body, {
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      childList: true,
      subtree: true,
    });

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

  installTopicConversationPerformanceDriver();
})();
