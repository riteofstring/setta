/* global Event, HTMLButtonElement, HTMLDetailsElement, HTMLElement, HTMLTextAreaElement, InputEvent, KeyboardEvent, WheelEvent, document, window */

(() => {
  const version = "setta-chat-workflow-driver-v1";

  function installChatWorkflowDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      backgroundTerminalMonitorState,
      chatSearchState,
      chatTranscriptScrollSnapshot,
      commandStartFailureActivityDetails,
      currentPlanSurface,
      clickCurrentPlanSurfaceFromTranscriptRow,
      focusedActivityRowContains,
      openChatSearch,
      openProjectedActivityRow,
      partialCorruptChatState,
      protocolGoalActiveWorkStack,
      providerStreamLifecycleActivityRendered,
      runPresentation,
      scrollChatTranscript,
      setComposerValueWithCaret,
      toggleProjectedActivityGroupDetails,
      wheelChatTranscript,
      workspaceChatSurfaceReady,
      chatWorkflowVersion: version,
    });
  }

  function backgroundTerminalMonitorState() {
    const footer = document.querySelector('[data-testid="background-terminals-footer"]');
    return {
      dismissButtonPresent: Boolean(
        document.querySelector('button[aria-label="Dismiss background terminal status"]'),
      ),
      footerPhase: attr(footer, "data-terminal-surface-state"),
      footerPresent: Boolean(footer),
      footerText: textOf(footer),
      monitorOpen: Boolean(document.querySelector('[data-testid="background-terminal-monitor"]')),
      processes: Array.from(
        document.querySelectorAll('[data-testid="background-terminal-monitor-process"]'),
      ).map((row) => ({
        command: attr(row, "data-command"),
        status: attr(row, "data-status"),
        text: textOf(row),
      })),
    };
  }

  function toggleProjectedActivityGroupDetails({ open, shouldPrimeAnchor, sourceRunItemIds }) {
    const groupHeaders = activityGroupHeaders();
    const groupHeader = activityGroupForEverySourceRunItem(groupHeaders, sourceRunItemIds);
    const expandAll = groupHeader?.parentElement?.querySelector(
      '[data-testid="activity-group-expand-all"]',
    );
    if (!(expandAll instanceof HTMLButtonElement)) {
      return missingExpandAll(groupHeaders);
    }
    const anchorTop = activityGroupAnchorTop(groupHeader, shouldPrimeAnchor);
    const details = activityRows()
      .filter((row) => sourceRunItemIds.includes(attr(row, "data-run-item-id")))
      .map(activityRowSummary);
    const groupExpanded = attr(groupHeader, "data-activity-group-expanded");
    const ok = activityGroupToggleReady({ details, groupExpanded, open, sourceRunItemIds });
    const result = {
      anchorTop,
      details,
      expectedOpen: open,
      groupExpanded,
      ok,
      reason: "already-toggled",
    };
    if (!ok) {
      result.anchorTopBefore = anchorTop;
      expandAll.click();
    }
    return result;
  }

  function activityGroupToggleReady({ details, groupExpanded, open, sourceRunItemIds }) {
    if (!open) {
      return groupExpanded === "false" && details.length === 0;
    }
    return (
      groupExpanded === "true" &&
      details.length === sourceRunItemIds.length &&
      details.every((detail) => detail.open && detail.text.includes("COMMAND"))
    );
  }

  function missingExpandAll(groupHeaders) {
    return {
      groups: groupHeaders.map(activityGroupSummary),
      ok: false,
      reason: "missing-expand-all",
    };
  }

  function activityGroupAnchorTop(groupHeader, shouldPrimeAnchor) {
    const anchor = groupHeader.parentElement;
    if (shouldPrimeAnchor && anchor !== null) {
      anchor.scrollIntoView({ block: "center" });
    }
    return anchor?.getBoundingClientRect().top ?? 0;
  }

  function openProjectedActivityRow({ sourceRunItemId }) {
    const groupHeaders = activityGroupHeaders();
    const groupHeader = activityGroupForSourceRunItem(groupHeaders, sourceRunItemId);
    let rows = activityRows();
    let row = activityRowForSourceRunItem(rows, sourceRunItemId);
    if (shouldExpandActivityGroup(row, groupHeader)) {
      groupHeader.click();
      rows = activityRows();
      row = activityRowForSourceRunItem(rows, sourceRunItemId);
    }
    if (!row) {
      return missingActivityRow(groupHeaders, rows);
    }
    return openActivityRow(row);
  }

  function shouldExpandActivityGroup(row, groupHeader) {
    return (
      !row &&
      groupHeader instanceof HTMLButtonElement &&
      attr(groupHeader, "data-activity-group-expanded") !== "true"
    );
  }

  function missingActivityRow(groupHeaders, rows) {
    return {
      groups: groupHeaders.map(activityGroupSummary),
      ok: false,
      reason: "missing-row",
      rows: rows.map(activityRowListItem),
    };
  }

  function openActivityRow(row) {
    if (!(row instanceof HTMLDetailsElement)) {
      return { ok: true, reason: "compact-row", text: textOf(row) };
    }
    if (!row.open) {
      row.querySelector("summary")?.click();
    }
    return { ok: row.open, reason: row.open ? "opened" : "not-opened", text: textOf(row) };
  }

  function commandStartFailureActivityDetails({ sourceRunItemId }) {
    const row = activityRowForSourceRunItem(activityRows(), sourceRunItemId);
    const text = textOf(row);
    const expected = [
      "Shell command failed to start",
      "printf scripted-start-failure",
      "Too many open files (os error 24)",
      "resource_exhaustion",
      "scripted-emfile-",
    ];
    return { ok: expected.every((candidate) => text.includes(candidate)), text };
  }

  function focusedActivityRowContains({ sourceRunItemId = "", texts = [] }) {
    const row = document.querySelector('[data-activity-focused="true"]');
    const idMatches = sourceRunItemId === "" || attr(row, "data-run-item-id") === sourceRunItemId;
    const text = textOf(row);
    return {
      ok: idMatches && texts.every((candidate) => text.includes(candidate)),
      sourceRunItemId: attr(row, "data-run-item-id"),
      text,
    };
  }

  function openChatSearch() {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, ctrlKey: true, key: "f", metaKey: true }),
    );
    return chatSearchState();
  }

  function chatSearchState() {
    return { open: Boolean(document.querySelector('input[placeholder="Search chat"]')) };
  }

  function setComposerValueWithCaret({ caret, value }) {
    const textarea = document.querySelector('textarea[aria-label="Ask Setta"]');
    if (!(textarea instanceof HTMLTextAreaElement) || textarea.disabled) {
      return false;
    }
    const previousValue = textarea.value;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    descriptor?.set?.call(textarea, value);
    textarea._valueTracker?.setValue(previousValue);
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    textarea.dispatchEvent(
      new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }),
    );
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    return textarea.value === value;
  }

  function runPresentation({ runId }) {
    const pane = document.querySelector('[data-testid="chat-detail-pane"]');
    const target = Array.from(document.querySelectorAll('[data-block-kind="run_status"]')).find(
      (row) => attr(row, "data-run-id") === runId,
    );
    const stop = document.querySelector('button[aria-label="Stop run"]');
    return {
      detailLivenessStatus: attr(pane, "data-run-liveness-status"),
      detailRunStatus: attr(pane, "data-run-status"),
      liveHeadline: Boolean(target?.querySelector('[data-live-headline="active"]')),
      mode: attr(target, "data-run-status-mode"),
      stopEnabled: stop instanceof HTMLButtonElement && !stop.disabled,
      text: target?.textContent ?? "",
    };
  }

  function chatTranscriptScrollSnapshot() {
    const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
    const debug = window.__settaChatTranscriptScrollDebug?.getSnapshot() ?? null;
    if (!(scroller instanceof HTMLElement) || debug === null) {
      return missingTranscriptScrollSnapshot(scroller, debug);
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

  function missingTranscriptScrollSnapshot(scroller, debug) {
    return {
      debug,
      jumpVisible: false,
      ready: false,
      reason: scroller instanceof HTMLElement ? "missing-debug-api" : "missing-scroller",
      visibleRows: [],
    };
  }

  async function scrollChatTranscript({
    distanceFromBottom = null,
    position = null,
    scrollTop = null,
  }) {
    const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
    if (!(scroller instanceof HTMLElement)) {
      return { ok: false, reason: "missing-scroller" };
    }
    const previousScrollTop = scroller.scrollTop;
    const nextScrollTop = nextChatTranscriptScrollTop(scroller, {
      distanceFromBottom,
      position,
      scrollTop,
    });
    if (nextScrollTop === null) {
      return { ok: false, reason: "missing-position" };
    }
    const scrollDelta = dispatchWheelIfNeeded(scroller, {
      distanceFromBottom,
      nextScrollTop,
      position,
      previousScrollTop,
    });
    if (scrollDelta < 0 && position !== "top") {
      window.__settaChatTranscriptScrollDebug?.detach();
    }
    await settleTranscriptScrollTop(scroller, nextScrollTop, position, scrollDelta);
    return { ok: true, snapshot: chatTranscriptScrollSnapshot() };
  }

  function dispatchWheelIfNeeded(scroller, options) {
    const deltaY = chatTranscriptScrollDelta(options);
    if (deltaY !== 0) {
      scroller.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY }));
    }
    return deltaY;
  }

  function wheelChatTranscript({ deltaY }) {
    const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
    if (!(scroller instanceof HTMLElement)) {
      return { ok: false, reason: "missing-scroller" };
    }
    scroller.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY }));
    return { ok: true, snapshot: chatTranscriptScrollSnapshot() };
  }

  function applyTranscriptScrollTop(scroller, scrollTop) {
    scroller.scrollTop = scrollTop;
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
  }

  async function settleTranscriptScrollTop(scroller, scrollTop, position, scrollDelta) {
    if (position !== "top") {
      await settleDirectTranscriptScrollTop(scroller, scrollTop, scrollDelta);
      return;
    }
    if (await scrollTranscriptToTopWithDebugApi(scroller)) {
      return;
    }
    const frameBudget = 12;
    for (let frame = 0; frame < frameBudget; frame += 1) {
      applyTranscriptScrollTop(scroller, scrollTop);
      await nextAnimationFrame();
      const snapshot = chatTranscriptScrollSnapshot();
      if (snapshot.debug?.scrollTop === 0) {
        return;
      }
    }
    applyTranscriptScrollTop(scroller, scrollTop);
  }

  async function settleDirectTranscriptScrollTop(scroller, scrollTop, scrollDelta) {
    const frameBudget = scrollDelta < 0 ? 12 : 2;
    for (let frame = 0; frame < frameBudget; frame += 1) {
      applyTranscriptScrollTop(scroller, scrollTop);
      await nextAnimationFrame();
      const snapshot = chatTranscriptScrollSnapshot();
      if (directTranscriptScrollSettled(snapshot, scroller, scrollTop, scrollDelta)) {
        return;
      }
    }
    applyTranscriptScrollTop(scroller, scrollTop);
  }

  function directTranscriptScrollSettled(snapshot, scroller, scrollTop, scrollDelta) {
    const targetReached =
      Math.abs((snapshot.debug?.scrollTop ?? scroller.scrollTop) - scrollTop) <= 2;
    if (!targetReached) {
      return false;
    }
    if (scrollDelta >= 0) {
      return true;
    }
    return snapshot.debug?.mode === "user_detached" && !snapshot.debug.atBottom;
  }

  async function scrollTranscriptToTopWithDebugApi(scroller) {
    const debugApi = window.__settaChatTranscriptScrollDebug;
    if (!debugApi) {
      return false;
    }
    debugApi.scrollToIndexAsProgrammaticScroll({ align: "start", index: 0 });
    const frameBudget = 20;
    for (let frame = 0; frame < frameBudget; frame += 1) {
      await nextAnimationFrame();
      const snapshot = chatTranscriptScrollSnapshot();
      if (snapshot.debug?.scrollTop === 0 && scroller.scrollTop === 0) {
        debugApi.detach();
        await nextAnimationFrame();
        return true;
      }
    }
    return false;
  }

  function nextAnimationFrame() {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }

  function protocolGoalActiveWorkStack() {
    const stack = document.querySelector('[data-testid="chat-active-work-stack"]');
    const rows = stack ? activeWorkStackRows(stack) : [];
    return { present: Boolean(stack), rows };
  }

  function activeWorkStackRows(stack) {
    return Array.from(
      stack.querySelectorAll(
        '[data-testid="current-plan-surface"], [data-testid="background-terminals-footer"]',
      ),
    ).map((row) => ({
      completedCount: attr(row, "data-plan-completed-count"),
      currentStep: attr(row, "data-current-step"),
      runId: attr(row, "data-run-id"),
      stepCount: attr(row, "data-plan-step-count"),
      testId: attr(row, "data-testid"),
      text: textOf(row),
    }));
  }

  function currentPlanSurface() {
    const surfaces = Array.from(document.querySelectorAll('[data-testid="current-plan-surface"]'));
    return currentPlanSurfaceSnapshot(surfaces[0] ?? null, surfaces.length);
  }

  function currentPlanSurfaceSnapshot(surface, count) {
    return {
      completedCount: attr(surface, "data-plan-completed-count"),
      count,
      currentStep: attr(surface, "data-current-step"),
      expanded: attr(surface, "data-expanded"),
      phase: attr(surface, "data-plan-state"),
      runId: attr(surface, "data-run-id"),
      runItemId: attr(surface, "data-run-item-id"),
      stepCount: attr(surface, "data-plan-step-count"),
      text: textOf(surface),
    };
  }

  function clickCurrentPlanSurfaceFromTranscriptRow({ sourceRunItemId }) {
    const row = activityRowForSourceRunItem(activityRows(), sourceRunItemId);
    const button = row?.querySelector('[data-testid="open-current-plan-surface"]');
    if (!(button instanceof HTMLButtonElement)) {
      return missingCurrentPlanButton(row);
    }
    button.click();
    return clickedCurrentPlanButtonState();
  }

  function missingCurrentPlanButton(row) {
    const surface = document.querySelector('[data-testid="current-plan-surface"]');
    const detail = document.querySelector('[data-testid="chat-detail-pane"]');
    return {
      currentPlanSurfaceRunId: attr(surface, "data-run-id"),
      currentPlanSurfaceRunItemId: attr(surface, "data-run-item-id"),
      ok: false,
      reason: "missing-button",
      rowRunId: attr(row, "data-run-id"),
      rowRunItemId: attr(row, "data-run-item-id"),
      rowText: textOf(row),
      runStatus: attr(detail, "data-run-status"),
    };
  }

  function clickedCurrentPlanButtonState() {
    const footerButton = document.querySelector('[data-testid="current-plan-footer"] button');
    const surface = document.querySelector('[data-testid="current-plan-surface"]');
    return {
      expanded: attr(surface, "data-expanded"),
      focused: document.activeElement === footerButton,
      ok: true,
    };
  }

  function providerStreamLifecycleActivityRendered({ livenessReason, sourceRunItemId, title }) {
    const groupHeader = visibleActivityGroupForSourceRunItem(sourceRunItemId);
    if (shouldOpenProviderStreamGroup(groupHeader)) {
      groupHeader.click();
      return { groupText: textOf(groupHeader), ok: false, reason: "expanding-group" };
    }
    return providerStreamLifecycleRowState({
      groupHeader,
      livenessReason,
      sourceRunItemId,
      title,
    });
  }

  function visibleActivityGroupForSourceRunItem(sourceRunItemId) {
    return activityGroupHeaders().find(
      (candidate) =>
        elementIsVisible(candidate) && activityGroupHasItem(candidate, sourceRunItemId),
    );
  }

  function shouldOpenProviderStreamGroup(groupHeader) {
    return (
      groupHeader instanceof HTMLButtonElement &&
      attr(groupHeader, "data-activity-group-expanded") !== "true"
    );
  }

  function providerStreamLifecycleRowState({
    groupHeader,
    livenessReason,
    sourceRunItemId,
    title,
  }) {
    const row = activityRows().find(
      (candidate) =>
        elementIsVisible(candidate) && attr(candidate, "data-run-item-id") === sourceRunItemId,
    );
    if (!(row instanceof HTMLDetailsElement)) {
      return providerStreamMissingRowState(row, groupHeader);
    }
    if (!row.open) {
      row.querySelector("summary")?.click();
      return providerStreamOpeningRowState(row, groupHeader);
    }
    const text = textOf(row);
    return {
      groupExpanded: attr(groupHeader, "data-activity-group-expanded"),
      ok: providerStreamTextMatches(text, { livenessReason, title }),
      reason: "waiting-for-details",
      text,
    };
  }

  function providerStreamMissingRowState(row, groupHeader) {
    return {
      groupExpanded: attr(groupHeader, "data-activity-group-expanded"),
      groupText: textOf(groupHeader),
      ok: false,
      reason: row ? "compact-row" : "missing-row",
      rowText: textOf(row),
    };
  }

  function providerStreamOpeningRowState(row, groupHeader) {
    return {
      groupExpanded: attr(groupHeader, "data-activity-group-expanded"),
      ok: false,
      reason: "opening-row",
      text: textOf(row),
    };
  }

  function providerStreamTextMatches(text, { livenessReason, title }) {
    return [
      title,
      "responseStreamDisconnected",
      "fake response stream disconnect",
      livenessReason,
      "thread_fake",
      "turn_fake",
    ].every((candidate) => text.includes(candidate));
  }

  function workspaceChatSurfaceReady() {
    const workspace = document.querySelector('[data-testid="workspace-layout-area"]');
    const chatSurface = document.querySelector('[data-testid="workspace-chat-dom-surface"]');
    const host = chatSurface?.closest('[data-testid="workspace-pane-host"]');
    return {
      chatMounted: Boolean(document.querySelector('[data-testid="chat-detail-pane"]')),
      hostMoving: attr(host, "data-moving"),
      hostRuntimeState: attr(host, "data-runtime-state"),
      hostVisible: attr(host, "data-visible"),
      workspaceMounted: Boolean(workspace),
    };
  }

  function partialCorruptChatState() {
    const state = partialCorruptChatSnapshot();
    return { ...state, ready: partialCorruptChatReady(state) };
  }

  function partialCorruptChatSnapshot() {
    const conversations = Array.from(
      document.querySelectorAll('[data-testid="conversation-list-item"]'),
    );
    const corruptConversation = conversations.find((conversation) =>
      textOf(conversation).includes("Corrupt historical chat"),
    );
    const conversationStatus = corruptConversation?.querySelector(
      '[data-testid="conversation-corruption-status"]',
    );
    const body = document.body.innerText;
    return {
      body,
      conversationCount: conversations.length,
      conversationStatusLabel: attr(conversationStatus, "aria-label"),
      newChatDisabled: newChatDisabledState(),
      sidebarHasStatus: sidebarHasWorkspaceCorruptionStatus(),
      statusLabel: attr(
        document.querySelector('[data-testid="workspace-corruption-status"]'),
        "aria-label",
      ),
    };
  }

  function partialCorruptChatReady(state) {
    const bodyChecks = [
      "Valid historical chat",
      "Second valid chat",
      "Corrupt historical chat",
    ].every((text) => state.body.includes(text));
    return (
      state.newChatDisabled !== null &&
      state.sidebarHasStatus &&
      state.statusLabel.includes("corrupt chat") &&
      state.conversationStatusLabel.includes("has pendingApproval while status is completed") &&
      state.conversationCount >= 3 &&
      bodyChecks &&
      !state.body.includes("Chat state needs attention") &&
      !state.body.includes("Chat state is corrupt")
    );
  }

  function newChatDisabledState() {
    const button = document.querySelector('button[aria-label="New chat"]');
    return button instanceof HTMLButtonElement ? button.disabled : null;
  }

  function sidebarHasWorkspaceCorruptionStatus() {
    const sidebar = document.querySelector('[data-testid="sidebar-scrollable-sections"]');
    const detail = document.querySelector('[data-testid="chat-detail-pane"]');
    const status = document.querySelector('[data-testid="workspace-corruption-status"]');
    return Boolean(status && sidebar?.contains(status) && !detail?.contains(status));
  }

  function activityGroupHeaders() {
    return Array.from(
      chatTranscriptRoot().querySelectorAll('[data-testid="activity-group-header"]'),
    );
  }

  function activityRows() {
    return Array.from(chatTranscriptRoot().querySelectorAll('[data-testid="run-activity-row"]'));
  }

  function chatTranscriptRoot() {
    return document.querySelector('[data-testid="chat-transcript-region"]') ?? document;
  }

  function activityRowForSourceRunItem(rows, sourceRunItemId) {
    return rows.find((candidate) => attr(candidate, "data-run-item-id") === sourceRunItemId);
  }

  function activityGroupForEverySourceRunItem(groupHeaders, sourceRunItemIds) {
    return groupHeaders.find((candidate) =>
      sourceRunItemIds.every((sourceRunItemId) => activityGroupHasItem(candidate, sourceRunItemId)),
    );
  }

  function activityGroupForSourceRunItem(groupHeaders, sourceRunItemId) {
    return groupHeaders.find((candidate) => activityGroupHasItem(candidate, sourceRunItemId));
  }

  function activityGroupHasItem(groupHeader, sourceRunItemId) {
    return attr(groupHeader, "data-activity-group-source-run-item-ids")
      .split(/\s+/)
      .includes(sourceRunItemId);
  }

  function activityGroupSummary(candidate) {
    return {
      expanded: attr(candidate, "data-activity-group-expanded"),
      sourceRunItemIds: attr(candidate, "data-activity-group-source-run-item-ids"),
      text: textOf(candidate),
    };
  }

  function activityRowSummary(row) {
    return {
      open: row instanceof HTMLDetailsElement ? row.open : false,
      sourceRunItemId: attr(row, "data-run-item-id"),
      text: textOf(row),
    };
  }

  function activityRowListItem(candidate) {
    return { sourceRunItemId: attr(candidate, "data-run-item-id"), text: textOf(candidate) };
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
      blockKind: attr(node, "data-block-kind"),
      bottom: Math.round(rect.bottom - scrollerRect.top),
      messageId: attr(node, "data-message-id"),
      role: attr(node, "data-message-role"),
      runId: attr(node.closest("[data-run-id]"), "data-run-id"),
      searchActive: attr(node, "data-search-active"),
      sourceRunItemId: attr(node, "data-run-item-id"),
      text: collapseWhitespace(node.textContent).slice(0, 220),
      top: Math.round(rect.top - scrollerRect.top),
    };
  }

  function nextChatTranscriptScrollTop(
    scroller,
    { distanceFromBottom = null, position = null, scrollTop = null },
  ) {
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

  function chatTranscriptScrollDelta({
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

  function elementIsVisible(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"
    );
  }

  function attr(element, attribute) {
    return element?.getAttribute(attribute) ?? "";
  }

  function textOf(element) {
    return element instanceof HTMLElement ? element.innerText : "";
  }

  function collapseWhitespace(text) {
    return (text ?? "").replace(/\s+/g, " ").trim();
  }

  installChatWorkflowDriver();
})();
