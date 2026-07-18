/* global Element, Event, HTMLButtonElement, HTMLElement, HTMLImageElement, document, getComputedStyle, performance, window */

(() => {
  const version = "setta-dom-pane-snapshot-scroll-driver-v1";
  const transcriptScrollerSelector = '[data-testid="chat-transcript-scroller"]';

  function installDomPaneSnapshotScrollDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      bodyTextContent,
      clickOverviewButton,
      clickProjectSidebarToggle,
      clickShowcaseConversation,
      domPaneSnapshotScrollVersion: version,
      liveChatScroller,
      liveHostScroller,
      overviewPaneSnapshot,
      sampleLiveScrollerAfterExit,
      scrollChatTranscriptToBottom,
    });
  }

  function bodyTextContent() {
    return document.body.textContent ?? "";
  }

  function clickShowcaseConversation() {
    const target = Array.from(document.querySelectorAll('button, [role="button"], a')).find(
      showcaseConversationElement,
    );
    if (!target) {
      return { ok: false, reason: "missing-conversation" };
    }
    target.click();
    return { ok: true };
  }

  function showcaseConversationElement(element) {
    const text = element.textContent ?? "";
    return text.includes("UI Showcase Chat");
  }

  function scrollChatTranscriptToBottom() {
    const scroller = chatTranscriptScroller();
    if (!scroller) {
      return { ok: false, reason: "missing-scroller" };
    }
    scroller.scrollTop = scroller.scrollHeight;
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    return {
      clientHeight: scroller.clientHeight,
      ok: true,
      scrollHeight: scroller.scrollHeight,
      scrollTop: scroller.scrollTop,
    };
  }

  function clickOverviewButton({ label }) {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.getAttribute("aria-label") === label,
    );
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-overview-button" };
    }
    button.click();
    return { ok: true };
  }

  function clickProjectSidebarToggle() {
    const button = document.querySelector('[data-testid="project-sidebar-toggle"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-project-sidebar-toggle" };
    }
    const label = button.getAttribute("aria-label") ?? "";
    button.click();
    return { label, ok: true };
  }

  function liveChatScroller() {
    const scroller = chatTranscriptScroller();
    if (!scroller) {
      return { ready: false, reason: "missing-scroller" };
    }
    const host = scroller.closest(".workspace-pane-host");
    const distanceFromBottom = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
    return {
      atBottom: Math.abs(distanceFromBottom) <= 1,
      clientHeight: scroller.clientHeight,
      distanceFromBottom,
      paneId: host instanceof HTMLElement ? (host.dataset.paneId ?? "") : "",
      ready: scroller.scrollTop > 0,
      scrollHeight: scroller.scrollHeight,
      scrollTop: scroller.scrollTop,
      text: textSlice(scroller, 300),
    };
  }

  function overviewPaneSnapshot({ paneId } = {}) {
    const hosts = overviewPaneHosts();
    return {
      ...chatOverviewSnapshot(hosts, paneId),
      hostCount: hosts.length,
      ...settingsOverviewSnapshot(hosts, paneId),
    };
  }

  function chatOverviewSnapshot(hosts, paneId) {
    const chatHost = findHostByPaneId(hosts, paneId);
    const chatRect = rectForElement(chatHost);
    const chatContent = chatContentElement(chatHost);
    const frozenVisual = childWithClass(chatHost, "workspace-frozen-dom-visual");
    const frozenScroller = queryHTMLElement(frozenVisual, transcriptScrollerSelector);
    const frozenScrollerStyle = styleForElement(frozenScroller);
    const centerTarget = centerTargetForRect(chatRect);
    const scroller = queryHTMLElement(chatHost, transcriptScrollerSelector);
    const bitmapTexture = queryHTMLElement(chatHost, ".workspace-snapshot-bitmap-texture");
    const texture = queryElement(
      chatHost,
      ".workspace-snapshot-surface .workspace-snapshot-texture",
    );
    const source = texture?.firstElementChild ?? null;

    return {
      bitmapCaptureKey: datasetValue(bitmapTexture, "snapshotCaptureKey"),
      bitmapFound: bitmapFound(bitmapTexture),
      centerHitLiveContent: centerHitLiveContent(chatContent, centerTarget),
      chatHostFound: Boolean(chatHost),
      clientHeight: elementNumber(scroller, "clientHeight"),
      frozenScrollerFound: Boolean(frozenScroller),
      frozenScrollerScrollbarWidth: frozenScrollerStyle?.scrollbarWidth ?? "",
      frozenVisualFound: Boolean(frozenVisual),
      frozenVisualText: textSlice(frozenVisual, 300),
      hostHeight: rectNumber(chatRect, "height"),
      hostRuntimeState: datasetValue(chatHost, "runtimeState"),
      hostSurfaceFrozen: datasetValue(chatHost, "surfaceFrozen"),
      hostSurfaceKind: datasetValue(chatHost, "surfaceKind"),
      hostWidth: rectNumber(chatRect, "width"),
      liveContentHidden: datasetValue(chatContent, "liveFrozenHidden"),
      scrollerFound: Boolean(scroller),
      scrollData: datasetValue(scroller, "snapshotScrollTop"),
      scrollHeight: elementNumber(scroller, "scrollHeight"),
      scrollTop: elementNumber(scroller, "scrollTop"),
      sourceClassName: classNameForHTMLElement(source),
      sourceHeight: sourceDimensionOrHost(source, chatRect, "height"),
      sourceWidth: sourceDimensionOrHost(source, chatRect, "width"),
      text: textSlice(chatHost, 500),
    };
  }

  function settingsOverviewSnapshot(hosts, paneId) {
    const settingsHost = findSettingsHost(hosts);
    const settingsPlaceholder = queryElement(
      settingsHost,
      '[data-testid="workspace-unloaded-surface-placeholder"]',
    );
    const settingsSnapshotTexture = queryElement(
      settingsHost,
      ".workspace-snapshot-bitmap, .workspace-snapshot-texture",
    );
    const fallbackSettingsSnapshotHost = findFallbackSettingsSnapshotHost(hosts, paneId);
    return {
      settingsHostFound: Boolean(settingsHost),
      settingsHostRuntimeState: datasetValue(settingsHost, "runtimeState"),
      settingsHostSurfaceFrozen: datasetValue(settingsHost, "surfaceFrozen"),
      settingsHostSurfaceKind: datasetValue(settingsHost, "surfaceKind"),
      settingsPlaceholderFound: Boolean(settingsPlaceholder),
      settingsSnapshotFound: Boolean(
        settingsPlaceholder || settingsSnapshotTexture || fallbackSettingsSnapshotHost,
      ),
    };
  }

  async function sampleLiveScrollerAfterExit({ durationMs = 900, paneId }) {
    const samples = [];
    const startedAt = performance.now();
    while (performance.now() - startedAt < durationMs) {
      samples.push({
        ...liveHostScroller({ paneId }),
        t: Math.round(performance.now() - startedAt),
      });
      await nextFrame();
    }
    return samples;
  }

  function liveHostScroller({ paneId }) {
    const liveHost = document.querySelector(
      `.workspace-pane-host[data-pane-id="${cssEscape(paneId)}"]`,
    );
    const scroller = queryHTMLElement(liveHost, transcriptScrollerSelector);
    return {
      found: Boolean(scroller),
      hostRuntimeState: datasetValue(liveHost, "runtimeState"),
      scrollTop: elementNumber(scroller, "scrollTop"),
    };
  }

  function overviewPaneHosts() {
    return Array.from(
      document.querySelectorAll('.workspace-pane-host[data-presentation-mode="overview"]'),
    );
  }

  function findHostByPaneId(hosts, paneId) {
    return (
      hosts.find((host) => host instanceof HTMLElement && host.dataset.paneId === paneId) ?? null
    );
  }

  function chatTranscriptScroller() {
    return queryHTMLElement(document, transcriptScrollerSelector);
  }

  function chatContentElement(chatHost) {
    return (
      childWithClass(chatHost, "workspace-react-dom-surface") ??
      childWithClass(chatHost, "workspace-pane-content")
    );
  }

  function childWithClass(parent, className) {
    if (!(parent instanceof HTMLElement)) {
      return null;
    }
    return Array.from(parent.children).find((child) => child.classList.contains(className)) ?? null;
  }

  function centerTargetForRect(rect) {
    if (!rect || rect.width <= 2 || rect.height <= 2) {
      return null;
    }
    return document.elementFromPoint(
      rect.left + Math.floor(rect.width / 2),
      rect.top + Math.floor(rect.height / 2),
    );
  }

  function centerHitLiveContent(chatContent, centerTarget) {
    if (!(chatContent instanceof HTMLElement) || !(centerTarget instanceof Element)) {
      return false;
    }
    return chatContent.contains(centerTarget);
  }

  function findSettingsHost(hosts) {
    for (const host of hosts) {
      if (!(host instanceof HTMLElement)) {
        continue;
      }
      if (host.dataset.surfaceKind === "settings-dom") {
        return host;
      }
      if (host.querySelector('[data-testid="workspace-settings-dom-surface"]')) {
        return host;
      }
    }
    return null;
  }

  function findFallbackSettingsSnapshotHost(hosts, paneId) {
    for (const host of hosts) {
      if (!(host instanceof HTMLElement) || host.dataset.paneId === paneId) {
        continue;
      }
      if (host.dataset.surfaceKind !== "snapshot") {
        continue;
      }
      if (host.querySelector(".workspace-snapshot-surface")) {
        return host;
      }
    }
    return null;
  }

  function bitmapFound(bitmapTexture) {
    const bitmapImage = queryElement(bitmapTexture, ".workspace-snapshot-bitmap");
    return bitmapTexture instanceof HTMLElement && bitmapImage instanceof HTMLImageElement;
  }

  function sourceDimensionOrHost(source, hostRect, dimension) {
    if (source) {
      return snapshotSourceDimension(source, dimension);
    }
    return rectNumber(hostRect, dimension);
  }

  function snapshotSourceDimension(source, dimension) {
    if (source instanceof HTMLImageElement) {
      return imageDimension(source, dimension);
    }
    if (source instanceof HTMLElement) {
      return elementSnapshotDimension(source, dimension);
    }
    return -1;
  }

  function imageDimension(source, dimension) {
    if (dimension === "height") {
      return source.naturalHeight || source.height;
    }
    return source.naturalWidth || source.width;
  }

  function elementSnapshotDimension(source, dimension) {
    const dataKey = dimension === "height" ? "snapshotHeight" : "snapshotWidth";
    return Number(source.dataset[dataKey] || source.getBoundingClientRect()[dimension]);
  }

  function queryHTMLElement(root, selector) {
    const element = queryElement(root, selector);
    return element instanceof HTMLElement ? element : null;
  }

  function queryElement(root, selector) {
    if (!root || typeof root.querySelector !== "function") {
      return null;
    }
    return root.querySelector(selector);
  }

  function styleForElement(element) {
    return element instanceof HTMLElement ? getComputedStyle(element) : null;
  }

  function rectForElement(element) {
    return element instanceof HTMLElement ? element.getBoundingClientRect() : null;
  }

  function rectNumber(rect, property) {
    return rect ? rect[property] : -1;
  }

  function elementNumber(element, property) {
    return element instanceof HTMLElement ? element[property] : -1;
  }

  function datasetValue(element, key) {
    return element instanceof HTMLElement ? (element.dataset[key] ?? "") : "";
  }

  function textSlice(element, length) {
    return element instanceof HTMLElement ? (element.textContent?.slice(0, length) ?? "") : "";
  }

  function classNameForHTMLElement(element) {
    return element instanceof HTMLElement ? element.className : "";
  }

  function nextFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  function cssEscape(value) {
    if (globalThis.CSS?.escape) {
      return globalThis.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, "\\$&");
  }

  installDomPaneSnapshotScrollDriver();
})();
