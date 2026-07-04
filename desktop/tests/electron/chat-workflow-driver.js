/* global Event, HTMLButtonElement, HTMLDetailsElement, HTMLElement, WheelEvent, document, window */

(() => {
  const version = "setta-chat-workflow-driver-v1";

  function installChatWorkflowDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      backgroundTerminalMonitorState,
      chatTranscriptScrollSnapshot,
      chatWorkflowVersion: version,
      scrollChatTranscript,
      toggleProjectedActivityGroupDetails,
      wheelChatTranscript,
    });
  }

  function backgroundTerminalMonitorState() {
    const footer = document.querySelector('[data-testid="background-terminals-footer"]');
    return {
      dismissButtonPresent: Boolean(
        document.querySelector('button[aria-label="Dismiss background terminal status"]'),
      ),
      footerPhase: footer?.getAttribute("data-terminal-surface-state") ?? "",
      footerPresent: Boolean(footer),
      footerText: footer?.innerText ?? "",
      monitorOpen: Boolean(document.querySelector('[data-testid="background-terminal-monitor"]')),
      processes: Array.from(
        document.querySelectorAll('[data-testid="background-terminal-monitor-process"]'),
      ).map((row) => ({
        command: row.getAttribute("data-command") ?? "",
        status: row.getAttribute("data-status") ?? "",
        text: row.innerText,
      })),
    };
  }

  function chatTranscriptScrollSnapshot() {
    const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
    const debug = window.__settaChatTranscriptScrollDebug?.getSnapshot() ?? null;
    if (!(scroller instanceof HTMLElement) || debug === null) {
      return {
        debug,
        jumpVisible: false,
        ready: false,
        reason: scroller instanceof HTMLElement ? "missing-debug-api" : "missing-scroller",
        visibleRows: [],
      };
    }
    return {
      debug,
      jumpVisible: Boolean(document.querySelector('[aria-label="Jump to latest"]')),
      maxScrollTop: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
      ready: true,
      reason: "",
      scrollTop: scroller.scrollTop,
      visibleRows: visibleTranscriptRows(scroller),
    };
  }

  function visibleTranscriptRows(scroller) {
    const scrollerRect = scroller.getBoundingClientRect();
    const selector =
      '[data-transcript-block="true"], [data-chat-message="true"], [data-testid="run-activity-group"], [data-testid="run-activity-row"]';
    return Array.from(scroller.querySelectorAll(selector))
      .map((node) => visibleTranscriptRow(node, scrollerRect))
      .filter((row) => row.bottom > 0 && row.top < scroller.clientHeight);
  }

  function visibleTranscriptRow(node, scrollerRect) {
    const rect = node.getBoundingClientRect();
    return {
      blockKind: node.getAttribute("data-block-kind") ?? "",
      bottom: Math.round(rect.bottom - scrollerRect.top),
      messageId: node.getAttribute("data-message-id") ?? "",
      role: node.getAttribute("data-message-role") ?? "",
      runId: node.closest("[data-run-id]")?.getAttribute("data-run-id") ?? "",
      searchActive: node.getAttribute("data-search-active") ?? "",
      sourceRunItemId: node.getAttribute("data-run-item-id") ?? "",
      text: collapseTranscriptWhitespace(node.textContent).slice(0, 220),
      top: Math.round(rect.top - scrollerRect.top),
    };
  }

  function scrollChatTranscript({ distanceFromBottom = null, position = null, scrollTop = null }) {
    const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
    if (!(scroller instanceof HTMLElement)) {
      return { ok: false, reason: "missing-scroller" };
    }
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    const previousScrollTop = scroller.scrollTop;
    const nextScrollTop = transcriptScrollTarget(scroller, {
      distanceFromBottom,
      position,
      scrollTop,
    });
    if (nextScrollTop === null) {
      return { ok: false, reason: "missing-position" };
    }
    dispatchTranscriptWheelIntent(scroller, {
      distanceFromBottom,
      nextScrollTop,
      position,
      previousScrollTop,
    });
    scroller.scrollTop = nextScrollTop;
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    return { ok: true, snapshot: chatTranscriptScrollSnapshot() };
  }

  function transcriptScrollTarget(scroller, { distanceFromBottom, position, scrollTop }) {
    if (position === "bottom") {
      return scroller.scrollHeight;
    }
    if (position === "top") {
      return 0;
    }
    if (typeof distanceFromBottom === "number") {
      return Math.max(0, scroller.scrollHeight - scroller.clientHeight - distanceFromBottom);
    }
    return typeof scrollTop === "number" ? scrollTop : null;
  }

  function dispatchTranscriptWheelIntent(scroller, scrollState) {
    const deltaY = transcriptScrollDeltaY(scrollState);
    if (deltaY !== 0) {
      scroller.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY }));
    }
  }

  function transcriptScrollDeltaY({
    distanceFromBottom,
    nextScrollTop,
    position,
    previousScrollTop,
  }) {
    if (nextScrollTop < previousScrollTop) {
      return -1;
    }
    if (nextScrollTop > previousScrollTop) {
      return 1;
    }
    if (position === "top") {
      return -1;
    }
    if (position === "bottom") {
      return 1;
    }
    return typeof distanceFromBottom === "number" && distanceFromBottom > 0 ? -1 : 0;
  }

  function wheelChatTranscript({ deltaY }) {
    const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
    if (!(scroller instanceof HTMLElement)) {
      return { ok: false, reason: "missing-scroller" };
    }
    scroller.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY }));
    return { ok: true, snapshot: chatTranscriptScrollSnapshot() };
  }

  function toggleProjectedActivityGroupDetails({ open, shouldPrimeAnchor, sourceRunItemIds }) {
    const context = activityGroupToggleContext(sourceRunItemIds);
    if (context.expandAll === null || context.groupHeader === null) {
      return missingActivityGroupToggle(context.groupHeaders);
    }
    const result = activityGroupToggleState({
      anchorTop: activityGroupAnchorTop(context.groupHeader, shouldPrimeAnchor),
      groupHeader: context.groupHeader,
      open,
      sourceRunItemIds,
      transcript: context.transcript,
    });
    clickActivityGroupToggleIfNeeded(context.expandAll, result);
    return result;
  }

  function activityGroupToggleContext(sourceRunItemIds) {
    const transcript = document.querySelector('[data-testid="chat-transcript-region"]') ?? document;
    const groupHeaders = Array.from(
      transcript.querySelectorAll('[data-testid="activity-group-header"]'),
    );
    const groupHeader = findActivityGroupHeader(groupHeaders, sourceRunItemIds);
    const expandAll = activityGroupExpandAllButton(groupHeader);
    return { expandAll, groupHeader, groupHeaders, transcript };
  }

  function activityGroupExpandAllButton(groupHeader) {
    const button = groupHeader?.parentElement?.querySelector(
      '[data-testid="activity-group-expand-all"]',
    );
    return button instanceof HTMLButtonElement ? button : null;
  }

  function activityGroupAnchorTop(groupHeader, shouldPrimeAnchor) {
    const anchor = groupHeader.parentElement;
    if (shouldPrimeAnchor && anchor !== null) {
      anchor.scrollIntoView({ block: "center" });
    }
    return anchor?.getBoundingClientRect().top ?? 0;
  }

  function clickActivityGroupToggleIfNeeded(expandAll, result) {
    if (!result.ok) {
      expandAll.click();
    }
  }

  function findActivityGroupHeader(groupHeaders, sourceRunItemIds) {
    return groupHeaders.find((candidate) => {
      const ids = new Set(
        (candidate.getAttribute("data-activity-group-source-run-item-ids") ?? "").split(/\s+/),
      );
      return sourceRunItemIds.every((sourceRunItemId) => ids.has(sourceRunItemId));
    });
  }

  function missingActivityGroupToggle(groupHeaders) {
    return {
      ok: false,
      reason: "missing-expand-all",
      groups: groupHeaders.map((candidate) => ({
        expanded: candidate.getAttribute("data-activity-group-expanded") ?? "",
        sourceRunItemIds: candidate.getAttribute("data-activity-group-source-run-item-ids") ?? "",
        text: candidate.innerText,
      })),
    };
  }

  function activityGroupToggleState({
    anchorTop,
    groupHeader,
    open,
    sourceRunItemIds,
    transcript,
  }) {
    const details = activityGroupDetails(transcript, sourceRunItemIds);
    const groupExpanded = groupHeader.getAttribute("data-activity-group-expanded") ?? "";
    const ok = activityGroupToggleMatches({
      details,
      groupExpanded,
      open,
      sourceRunItemIds,
    });
    return {
      ok,
      details,
      expectedOpen: open,
      groupExpanded,
      anchorTop,
      reason: "already-toggled",
      ...(ok ? {} : { anchorTopBefore: anchorTop }),
    };
  }

  function activityGroupDetails(transcript, sourceRunItemIds) {
    return Array.from(transcript.querySelectorAll('[data-testid="run-activity-row"]'))
      .filter((row) => sourceRunItemIds.includes(row.getAttribute("data-run-item-id") ?? ""))
      .map((row) => ({
        open: row instanceof HTMLDetailsElement ? row.open : false,
        sourceRunItemId: row.getAttribute("data-run-item-id") ?? "",
        text: row.innerText,
      }));
  }

  function activityGroupToggleMatches({ details, groupExpanded, open, sourceRunItemIds }) {
    if (!open) {
      return groupExpanded === "false" && details.length === 0;
    }
    return (
      groupExpanded === "true" &&
      details.length === sourceRunItemIds.length &&
      details.every((detail) => detail.open) &&
      details.every((detail) => detail.text.includes("COMMAND"))
    );
  }

  function collapseTranscriptWhitespace(text) {
    return (text ?? "").replace(/\s+/g, " ").trim();
  }

  installChatWorkflowDriver();
})();
