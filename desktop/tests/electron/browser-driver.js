/* global CustomEvent, Element, Event, HTMLButtonElement, HTMLCanvasElement, HTMLElement, HTMLInputElement, HTMLTextAreaElement, InputEvent, KeyboardEvent, document, getComputedStyle, window */

(() => {
  const workflowDefinitionChangedEventName = "setta:workflow-definition-changed";

  function bodyText() {
    return { body: document.body.innerText };
  }

  function buttonByKind(kind, value) {
    if (kind === "aria-label") {
      return document.querySelector(`button[aria-label="${cssEscape(value)}"]`);
    }
    if (kind === "text") {
      return Array.from(document.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.trim() === value,
      );
    }
    throw new Error(`unsupported button lookup kind: ${kind}`);
  }

  function clickButton({ kind, value }) {
    const button = buttonByKind(kind, value);
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { body: document.body.innerText, clicked: false };
    }
    button.click();
    return { body: document.body.innerText, clicked: true };
  }

  function buttonReady({ kind, value }) {
    const button = buttonByKind(kind, value);
    return {
      ready: button instanceof HTMLButtonElement && !button.disabled,
    };
  }

  function clickButtonContainingText({ text }) {
    const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
      candidate.innerText.includes(text),
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { body: document.body.innerText, clicked: false };
    }
    button.click();
    return { body: document.body.innerText, clicked: true };
  }

  function clickButtonContainingTextByRole({ role, text }) {
    const selector = `button[role="${cssEscape(role)}"]`;
    const button = Array.from(document.querySelectorAll(selector)).find((candidate) =>
      candidate.innerText.includes(text),
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { body: document.body.innerText, clicked: false };
    }
    button.click();
    return { body: document.body.innerText, clicked: true };
  }

  function composerReady() {
    const textarea = document.querySelector('textarea[aria-label="Ask Setta"]');
    return { ready: Boolean(textarea && !textarea.disabled) };
  }

  function composerFocus() {
    const active = document.activeElement;
    const textarea = document.querySelector('textarea[aria-label="Ask Setta"]');
    return {
      ...activeElementSnapshot(active),
      documentHasFocus: document.hasFocus(),
      focused: elementAttribute(active, "aria-label") === "Ask Setta",
      ...textareaSnapshot(textarea),
    };
  }

  function conversationRows() {
    return {
      rows: Array.from(document.querySelectorAll('[data-testid="conversation-list-item"]')).map(
        (row) => ({
          text: row.innerText,
          unread: Boolean(row.querySelector('[aria-label="Unread assistant response"]')),
        }),
      ),
    };
  }

  function chatTranscriptRows() {
    return {
      rows: Array.from(document.querySelectorAll('[data-chat-message="true"]')).map((row) => ({
        role: row.getAttribute("data-message-role"),
        text: row.innerText.trim(),
      })),
    };
  }

  // chatTranscriptBlockOrder returns the recognized transcript blocks in document order. It is
  // the cross-phase diagnostic used to compare provider chronology, backend order, and DOM order.
  // Today it reads the current DOM
  // hooks (message role plus the run-activity-group/row test ids), so the order is flattened.
  // Those hooks disappear in the Phase 5 refactor, so it also prefers a stable
  // data-transcript-block + data-block-kind tagging when present; Phase 5 should add that so the
  // characterization flip becomes a one-line expectation change instead of a driver rewrite.
  function chatTranscriptBlockOrder() {
    const blockSelector =
      '[data-transcript-block], [data-chat-message="true"], [data-testid="run-activity-group"], [data-testid="run-activity-row"]';
    const region =
      document.querySelector('[data-testid="chat-transcript-region"]') ?? document.body;
    const nodes = Array.from(region.querySelectorAll(blockSelector));
    return {
      blocks: nodes.map((node) => {
        const kind = transcriptBlockKind(node);
        return {
          kind,
          role: node.getAttribute("data-message-role") ?? "",
          runId: node.closest("[data-run-id]")?.getAttribute("data-run-id") ?? "",
          sourceRunItemId: node.getAttribute("data-run-item-id") ?? "",
          text: transcriptBlockText(node, kind, blockSelector),
        };
      }),
    };
  }

  function transcriptBlockKind(node) {
    // Prefer the stable Phase 5 tagging when present; otherwise infer from the current hooks.
    const blockKind = node.getAttribute("data-block-kind");
    if (blockKind) {
      return blockKind;
    }
    const testId = node.getAttribute("data-testid");
    if (testId === "run-activity-group") {
      return "activity_group";
    }
    if (testId === "run-activity-row") {
      return "activity_row";
    }
    const role = node.getAttribute("data-message-role");
    if (role === "user") {
      return "user_message";
    }
    if (role === "assistant") {
      return "assistant_text";
    }
    return role ? `message:${role}` : "message";
  }

  function transcriptBlockText(node, kind, blockSelector) {
    if (kind === "assistant_text" || kind === "user_message") {
      const role = node.getAttribute("data-message-role");
      const content = node.querySelector(`[data-testid="chat-${role}-message-content"]`);
      if (content instanceof HTMLElement) {
        return collapseTranscriptWhitespace(content.textContent).slice(0, 240);
      }
    }
    const clone = node.cloneNode(true);
    for (const nested of Array.from(clone.querySelectorAll(blockSelector))) {
      nested.remove();
    }
    return collapseTranscriptWhitespace(clone.textContent).slice(0, 240);
  }

  function collapseTranscriptWhitespace(text) {
    return (text ?? "").replace(/\s+/g, " ").trim();
  }

  function visibleUserMessageTexts() {
    return {
      rows: Array.from(document.querySelectorAll('[data-chat-message="true"]'))
        .filter((row) => row.getAttribute("data-message-role") === "user")
        .map((row) => row.innerText.trim()),
    };
  }

  function chatLayoutMetrics() {
    const pane = document.querySelector('[data-testid="chat-detail-pane"]');
    const transcript = document.querySelector('[data-testid="chat-transcript-region"]');
    const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
    const composer = document.querySelector('[data-testid="chat-composer"]');
    return {
      composer: elementVerticalRect(composer),
      pane: elementVerticalRect(pane),
      scrollerClientHeight: scroller?.clientHeight ?? 0,
      scrollerScrollHeight: scroller?.scrollHeight ?? 0,
      transcript: elementVerticalRect(transcript),
    };
  }

  function dispatchLayoutSnapshot({ trigger }) {
    window.dispatchEvent(
      new CustomEvent("setta:record-layout-snapshot", {
        detail: { trigger },
      }),
    );
    return true;
  }

  function elementValue({ selector }) {
    const element = document.querySelector(selector);
    return { value: element?.value ?? null };
  }

  function dispatchDocumentEscape() {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    return true;
  }

  function modelPicker() {
    const picker = document.querySelector('[data-testid="model-picker"]');
    return { body: document.body.innerText, open: Boolean(picker), ready: Boolean(picker) };
  }

  function modelPickerSummaryButton() {
    const button = document.querySelector('[aria-label="Open model and reasoning picker"]');
    return {
      ready: Boolean(button),
      text: button instanceof HTMLElement ? button.innerText : "",
    };
  }

  function modelPickerButtonReady({ text }) {
    const picker = document.querySelector('[data-testid="model-picker"]');
    const buttons = Array.from(picker?.querySelectorAll("button") ?? []);
    return {
      ready: buttons.some((button) => button.innerText.includes(text)),
    };
  }

  function clickModelPickerButton({ text }) {
    const picker = document.querySelector('[data-testid="model-picker"]');
    const buttons = Array.from(picker?.querySelectorAll("button") ?? []);
    const button = buttons.find((candidate) => candidate.innerText.includes(text));
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  }

  function selectedModelPickerItems({ attribute }) {
    const picker = document.querySelector('[data-testid="model-picker"]');
    const selected = Array.from(picker?.querySelectorAll(`[${attribute}="true"]`) ?? []).map(
      (button) => button.innerText,
    );
    return { selected };
  }

  function rendererWorkspace() {
    const detail = document.querySelector('[data-testid="chat-detail-pane"]');
    return { workspaceId: detail?.getAttribute("data-workspace-id") ?? "" };
  }

  function scrollSidebarNavigationTo({ scrollTop }) {
    const list = document.querySelector('[data-testid="sidebar-navigation-list"]');
    if (!list) {
      return false;
    }
    list.scrollTop = scrollTop;
    list.dispatchEvent(new Event("scroll", { bubbles: true }));
    return true;
  }

  function selectedConversation() {
    const panel = document.querySelector('[data-testid="chat-detail-pane"]');
    return {
      selectedConversationId: panel?.getAttribute("data-conversation-id") ?? "",
    };
  }

  function setInputValue({ selector, value }) {
    const element = document.querySelector(selector);
    if (
      !(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) ||
      element.disabled
    ) {
      return false;
    }
    const previousValue = element.value;
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor?.set?.call(element, value);
    element._valueTracker?.setValue(previousValue);
    element.focus();
    element.select();
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: value,
        inputType: "insertText",
      }),
    );
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return element.value === value;
  }

  function sidebarMetrics() {
    return {
      activeRows: document.querySelectorAll('[data-testid="active-workspace-item"]').length,
      conversationRows: document.querySelectorAll('[data-testid="conversation-sidebar-item"]')
        .length,
      recentRows: document.querySelectorAll('[data-testid="recent-workspace-item"]').length,
      totalElements: document.querySelectorAll("*").length,
    };
  }

  function visibleAssistantTexts() {
    const rows = Array.from(
      document.querySelectorAll(
        '[data-chat-message="true"], [data-testid="chat-assistant-turn-row"], [data-testid="chat-message-row"], [data-testid="chat-queued-turn-row"]',
      ),
    );
    const assistantTexts = rows
      .filter((row) => row.getAttribute("data-message-role") === "assistant")
      .map((row) => row.innerText.trim())
      .filter((text) => text !== "" && text !== "...");
    return { assistantTexts };
  }

  function visibleWorkflowGraphCount() {
    return Array.from(document.querySelectorAll('[data-testid="workflow-graph"]')).filter(
      (candidate) => elementIntersectsViewport(candidate),
    ).length;
  }

  function terminalSnapshot() {
    const host = activeTerminalHost();
    if (!host) {
      return emptyTerminalSnapshot(false);
    }
    return terminalSnapshotForHost(host);
  }

  function terminalPaneFocusPoint() {
    const host = activeTerminalHost();
    if (!host) {
      return { ok: false, reason: "missing-terminal-host" };
    }
    if (!terminalHostIntersectsViewport(host)) {
      return { ok: false, reason: "terminal-host-outside-viewport", rect: elementRect(host) };
    }
    const rect = host.getBoundingClientRect();
    return {
      ok: true,
      x: Math.round(clamp(rect.left + rect.width / 2, 8, window.innerWidth - 8)),
      y: Math.round(clamp(rect.top + 8, 8, window.innerHeight - 8)),
    };
  }

  function focusTerminalTextarea() {
    const host = activeTerminalHost();
    const viewport = host?.querySelector(".workspace-xterm-viewport");
    const textarea = host?.querySelector(".xterm-helper-textarea");
    if (!(viewport instanceof HTMLElement) || !(textarea instanceof HTMLTextAreaElement)) {
      return { ok: false, reason: "missing-xterm-focus-target" };
    }
    viewport.click();
    textarea.focus();
    return { ok: document.activeElement === textarea };
  }

  function maximizeTerminalPane() {
    const host = activeTerminalHost();
    const button = host?.querySelector('[data-workspace-pane-maximize-button="true"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-maximize-button" };
    }
    if (host.dataset.maximized !== "true") {
      button.click();
    }
    return { ok: true };
  }

  async function terminalScrollbackSearch({ expectedText }) {
    const host = activeTerminalHost();
    if (!host) {
      return { ...emptyTerminalSnapshot(false), found: false, source: "missing-host" };
    }
    const visibleSnapshot = terminalSnapshotForHost(host);
    if (visibleSnapshot.text.includes(expectedText)) {
      return { ...visibleSnapshot, found: true, source: "visible" };
    }
    const viewport = host.querySelector(".xterm-viewport");
    if (!(viewport instanceof HTMLElement)) {
      return { ...visibleSnapshot, found: false, source: "missing-viewport" };
    }

    const originalTop = viewport.scrollTop;
    const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const step = Math.max(1, Math.floor(viewport.clientHeight * 0.75));
    const positions = [];
    for (let top = maxTop; top > 0; top -= step) {
      positions.push(top);
    }
    positions.push(0);

    try {
      for (const top of positions) {
        viewport.scrollTop = top;
        viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
        await nextFrame();
        const text = rowsForTerminalHost(host);
        if (text.includes(expectedText)) {
          return {
            ...terminalSnapshotForHost(host),
            found: true,
            scrollHeight: viewport.scrollHeight,
            scrollTop: top,
            source: "scrollback",
            text,
          };
        }
      }
      return {
        ...terminalSnapshotForHost(host),
        found: false,
        scrollHeight: viewport.scrollHeight,
        scrollTop: viewport.scrollTop,
        source: "scanned",
      };
    } finally {
      viewport.scrollTop = originalTop;
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
      await nextFrame();
    }
  }

  function maximizeWorkflowGraphPane({ surfaceId = null } = {}) {
    const state = maximizeWorkflowGraphPaneState({ surfaceId });
    if (!state.ok) {
      throw new Error(`workflow graph maximize button is missing: ${JSON.stringify(state)}`);
    }
    return state.surfaceId;
  }

  function maximizeWorkflowGraphPaneState({ surfaceId = null } = {}) {
    const surface = workflowGraphMaximizeSurface(surfaceId);
    if (!surface) {
      return {
        ok: false,
        reason: "missing-workflow-graph-surface",
        roots: workflowGraphRootStates(),
        surfaceId: null,
      };
    }
    const host = surface.closest('[data-testid="workspace-pane-host"]');
    const resolvedSurfaceId = surface.dataset.surfaceId ?? null;
    if (paneHostBoolean(host, "maximized", false)) {
      return { ok: true, reason: "already-maximized", surfaceId: resolvedSurfaceId };
    }
    const button = host?.querySelector('[data-workspace-pane-maximize-button="true"]');
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: "missing-maximize-button",
        roots: workflowGraphRootStates(),
        surfaceId: resolvedSurfaceId,
      };
    }
    button.click();
    return { ok: true, reason: "clicked", surfaceId: resolvedSurfaceId };
  }

  function workflowGraphMaximizeSurface(surfaceId) {
    const preferredSurface = workflowGraphSurfaceById(surfaceId);
    if (workflowGraphMaximizeButton(preferredSurface)) {
      return preferredSurface;
    }
    return activeWorkflowGraphSurface();
  }

  function workflowGraphMaximizeButton(surface) {
    const host = surface?.closest('[data-testid="workspace-pane-host"]');
    const button = host?.querySelector('[data-workspace-pane-maximize-button="true"]');
    return button instanceof HTMLButtonElement ? button : null;
  }

  function newFrameButtonOrWorkflowMenuExists() {
    return (
      Boolean(document.querySelector('button[aria-label="New frame"]')) ||
      Boolean(workflowGraphMenuItem())
    );
  }

  function openWorkflowGraphToolbarMenu() {
    if (workflowGraphMenuItem()) {
      return { ok: true, state: "already-open" };
    }
    const button = document.querySelector('button[aria-label="New frame"]');
    if (!(button instanceof HTMLButtonElement)) {
      return {
        buttons: Array.from(document.querySelectorAll("button")).map((candidate) => ({
          ariaLabel: candidate.getAttribute("aria-label"),
          disabled: candidate.disabled,
          text: candidate.textContent?.trim() ?? "",
          title: candidate.title,
        })),
        ok: false,
        reason: "missing-new-frame-button",
      };
    }
    button.click();
    return { ok: true, state: "opened" };
  }

  function workflowGraphMenuItemExists() {
    return Boolean(workflowGraphMenuItem());
  }

  function selectWorkflowGraphMenuItem() {
    const item = workflowGraphMenuItem();
    if (!(item instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-workflow-graph-menu-item" };
    }
    if (item.disabled) {
      return { ok: false, reason: "disabled-workflow-graph-menu-item" };
    }
    item.click();
    return { ok: true };
  }

  function workflowGraphCanvasRect({ surfaceId }) {
    const state = workflowGraphCanvasRectState({ surfaceId });
    if (!state.rect) {
      throw new Error(`workflow graph canvas is missing: ${JSON.stringify(state)}`);
    }
    return state.rect;
  }

  function workflowGraphCanvasRectState({ surfaceId }) {
    const roots = Array.from(document.querySelectorAll('[data-testid="workflow-graph"]'));
    const root =
      surfaceId === null
        ? roots[0]
        : roots.find((candidate) => candidate.dataset.surfaceId === surfaceId);
    const canvas = root?.querySelector('[data-testid="workflow-graph-canvas"]');
    if (!(canvas instanceof HTMLCanvasElement)) {
      return {
        ready: false,
        reason: "missing-canvas",
        rect: null,
        roots: roots.map(workflowGraphRootState),
      };
    }
    const rect = canvas.getBoundingClientRect();
    const value = {
      clientHeight: canvas.clientHeight || rect.height,
      clientWidth: canvas.clientWidth || rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width,
    };
    return {
      ready: workflowGraphCanvasRectReady(value),
      reason: workflowGraphCanvasRectReady(value) ? "" : "zero-size-canvas",
      rect: value,
      roots: roots.map(workflowGraphRootState),
    };
  }

  function workflowGraphCanvasRectReady(rect) {
    return rect.clientHeight > 0 && rect.clientWidth > 0 && rect.height > 0 && rect.width > 0;
  }

  function workflowGraphDebugSnapshot({ includeVisual = true, surfaceId }) {
    const api = window.__settaWorkflowGraphDebug;
    if (!api) {
      throw new Error("workflow graph debug API is not installed");
    }
    return api.getSnapshot(surfaceId, { includeVisual });
  }

  function workflowGraphDebugSnapshotReady({ includeVisual = true, surfaceId }) {
    const api = window.__settaWorkflowGraphDebug;
    if (!api) {
      return workflowGraphDebugNotReady("missing-debug-api");
    }
    const surfaceIds = api.getSurfaceIds();
    if (surfaceId && !surfaceIds.includes(surfaceId)) {
      return workflowGraphDebugNotReady("surface-not-registered", surfaceIds);
    }
    return { ready: true, snapshot: api.getSnapshot(surfaceId, { includeVisual }) };
  }

  function workflowGraphDebugNotReady(reason, surfaceIds = []) {
    return {
      flags: window.setta?.app.flags ?? null,
      ready: false,
      reason,
      roots: workflowGraphRootStates(),
      surfaceIds,
    };
  }

  function workflowGraphRootStates() {
    return Array.from(document.querySelectorAll('[data-testid="workflow-graph"]')).map(
      workflowGraphRootState,
    );
  }

  function workflowGraphRootState(root) {
    const rect = root.getBoundingClientRect();
    return {
      canvasCount: root.querySelectorAll("canvas").length,
      height: rect.height,
      left: rect.left,
      surfaceId: root.dataset.surfaceId ?? null,
      top: rect.top,
      visible: elementIntersectsViewport(root),
      width: rect.width,
    };
  }

  async function workflowWorkspaceSessionState() {
    const session = await window.setta.workspace.session();
    return {
      activeWorkspaceCount: session.activeWorkspaces.length,
      body: document.body.innerText,
      selectedWorkspaceId: session.selectedWorkspaceId,
    };
  }

  function selectWorkflowNodeType({ nodeType }) {
    const button = document.querySelector(`[data-testid="workflow-node-create-${nodeType}"]`);
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-node-menu-item" };
    }
    button.click();
    return { ok: true };
  }

  function openWorkflowToolbarAddMenu() {
    const button = workflowToolbarElement('[data-testid="workflow-add-node-button"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, reason: "missing-or-disabled-add-button" };
    }
    button.click();
    return { ok: true };
  }

  function selectWorkflowToolbarNodeType({ nodeType }) {
    const button = workflowToolbarElement(`[data-testid="workflow-toolbar-add-${nodeType}"]`);
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-toolbar-node-menu-item" };
    }
    button.click();
    return { ok: true };
  }

  function workflowToolbarState() {
    const state = workflowToolbarElement('[data-testid="workflow-toolbar-state"]');
    return { text: state?.textContent?.trim() ?? "" };
  }

  function clickWorkflowToolbarButton({ testId }) {
    const button = workflowToolbarElement(`[data-testid="${testId}"]`);
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, reason: "button-unavailable" };
    }
    button.click();
    return { ok: true };
  }

  function workflowToolbarButtonState({ testId }) {
    // Scope to the active workflow graph host. Toolbar slots are always present now, so a
    // background pane in another view can also expose the same testId; an unscoped lookup would
    // read the wrong instance.
    const button = workflowToolbarElement(`[data-testid="${testId}"]`);
    return {
      disabled: button instanceof HTMLButtonElement ? button.disabled : true,
      exists: button instanceof HTMLButtonElement,
      text: button instanceof HTMLButtonElement ? (button.textContent?.trim() ?? "") : "",
    };
  }

  function workflowValidationPanelState() {
    // The draft validation panel is a draft-only overlay inside the active workflow graph host.
    const panel = workflowToolbarElement('[data-testid="workflow-validation-panel"]');
    return {
      exists: panel instanceof HTMLElement,
      text:
        panel instanceof HTMLElement ? (panel.textContent?.trim().replace(/\s+/g, " ") ?? "") : "",
    };
  }

  function workflowToolbarSlotRects({ testIds = [] }) {
    return readWorkflowToolbarFrame(testIds);
  }

  function readWorkflowToolbarFrame(testIds = []) {
    // Read the stable toolbar slots plus the title/state text from the active workflow graph host
    // so frame-by-frame checks can prove each slot holds its x position across modes and the title
    // never collapses to "Blank workflow draft" while a projection is displayed.
    const titleElement = workflowToolbarElement('[data-testid="workflow-toolbar-title"]');
    const stateElement = workflowToolbarElement('[data-testid="workflow-toolbar-state"]');
    return {
      slots: testIds.map((testId) => workflowToolbarSlotRect(testId)),
      state: stateElement instanceof HTMLElement ? (stateElement.textContent?.trim() ?? "") : "",
      title: titleElement instanceof HTMLElement ? (titleElement.textContent?.trim() ?? "") : "",
    };
  }

  function workflowToolbarSlotRect(testId) {
    const element = workflowToolbarElement(`[data-testid="${testId}"]`);
    if (!(element instanceof HTMLElement)) {
      return { present: false, testId };
    }
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      left: rect.left,
      present: true,
      right: rect.right,
      testId,
      top: rect.top,
      width: rect.width,
    };
  }

  async function clickWorkflowRunAndReadStartFrame(options = {}) {
    const slotTestIds = options.slotTestIds;
    const runButton = workflowToolbarElement('[data-testid="workflow-run-button"]');
    if (!(runButton instanceof HTMLButtonElement) || runButton.disabled) {
      return { clicked: false, reason: "run-button-unavailable" };
    }
    runButton.click();
    // The run-accept handler commits the Starting state and the cleared validation overlay in one
    // React render, but that commit is async (click() does not flush it synchronously here). Spin
    // on rAF until the toolbar shows Starting, then read the validation panel in the SAME frame so
    // the Starting state and the panel presence are observed atomically — proving the panel is
    // already gone at the Starting frame rather than lingering until the run projection loads.
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const button = workflowToolbarElement('[data-testid="workflow-run-button"]');
      if (!(button instanceof HTMLElement)) {
        break;
      }
      const runButtonText = button.textContent?.trim() ?? "";
      if (runButtonText.includes("Starting")) {
        const panel = workflowToolbarElement('[data-testid="workflow-validation-panel"]');
        return {
          clicked: true,
          observedStartingFrame: true,
          runButtonText,
          startFrame: readWorkflowToolbarFrame(slotTestIds),
          validationPanelPresent: panel instanceof HTMLElement,
        };
      }
      await nextFrame();
    }
    const panel = workflowToolbarElement('[data-testid="workflow-validation-panel"]');
    return {
      clicked: true,
      observedStartingFrame: false,
      startFrame: readWorkflowToolbarFrame(slotTestIds),
      validationPanelPresent: panel instanceof HTMLElement,
    };
  }

  function openWorkflowRunSelector() {
    const button = workflowToolbarElement('[data-testid="workflow-run-selector-button"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, reason: "selector-unavailable" };
    }
    button.click();
    return { ok: true };
  }

  function selectWorkflowRunSelectorRow({ executionId }) {
    const rows = Array.from(
      document.querySelectorAll('[data-testid^="workflow-run-selector-row-"]'),
    );
    const row = rows.find(
      (candidate) =>
        candidate instanceof HTMLButtonElement &&
        candidate.getAttribute("data-testid") === `workflow-run-selector-row-${executionId}`,
    );
    if (!(row instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-run-row" };
    }
    row.click();
    return { ok: true };
  }

  function workflowRunSelectorState() {
    const toolbar = workflowToolbarElement('[data-testid="workflow-graph-toolbar"]');
    const button = workflowToolbarElement('[data-testid="workflow-run-selector-button"]');
    const rows = Array.from(
      document.querySelectorAll('[data-testid^="workflow-run-selector-row-"]'),
    ).map((row) => ({
      current: row.getAttribute("aria-current") ?? "",
      testId: row.getAttribute("data-testid") ?? "",
      text: row.textContent?.trim().replace(/\s+/g, " ") ?? "",
    }));
    return {
      buttonDisabled: button instanceof HTMLButtonElement ? button.disabled : true,
      buttonExists: button instanceof HTMLButtonElement,
      buttonText: button instanceof HTMLButtonElement ? (button.textContent?.trim() ?? "") : "",
      menuOpen: Boolean(document.querySelector('[data-testid="workflow-run-selector-menu"]')),
      rows,
      toolbarVisible:
        toolbar instanceof HTMLElement &&
        toolbar.getBoundingClientRect().width > 0 &&
        toolbar.getBoundingClientRect().height > 0,
    };
  }

  function workflowToolbarElement(selector) {
    return activeWorkflowGraphHost()?.querySelector(selector) ?? document.querySelector(selector);
  }

  function activeWorkflowGraphSurface() {
    const host = activeWorkflowGraphHost();
    return host?.querySelector('[data-testid="workflow-graph"]') ?? null;
  }

  function activeWorkflowGraphHost() {
    const hostSelectors = [
      '[data-testid="workspace-pane-host"][data-surface-kind="workflow-graph"][data-maximized="true"][data-visible="true"][data-surface-visible="true"][data-surface-frozen="false"][data-moving="false"]',
      '[data-testid="workspace-pane-host"][data-surface-kind="workflow-graph"][data-focused="true"][data-visible="true"][data-surface-visible="true"][data-surface-frozen="false"][data-moving="false"]',
      '[data-testid="workspace-pane-host"][data-surface-kind="workflow-graph"][data-visible="true"][data-surface-visible="true"][data-surface-frozen="false"][data-moving="false"]',
      '[data-testid="workspace-pane-host"][data-surface-kind="workflow-graph"][data-maximized="true"][data-visible="true"]',
      '[data-testid="workspace-pane-host"][data-surface-kind="workflow-graph"][data-focused="true"][data-visible="true"]',
      '[data-testid="workspace-pane-host"][data-surface-kind="workflow-graph"][data-visible="true"]',
    ];
    for (const selector of hostSelectors) {
      const host = document.querySelector(selector);
      if (host instanceof HTMLElement) {
        return host;
      }
    }
    return null;
  }

  function workflowGraphHostBySurfaceId(surfaceId) {
    return (
      workflowGraphSurfaceById(surfaceId)?.closest('[data-testid="workspace-pane-host"]') ?? null
    );
  }

  function workflowGraphSurfaceById(surfaceId) {
    if (!surfaceId) {
      return null;
    }
    return (
      Array.from(document.querySelectorAll('[data-testid="workflow-graph"]')).find(
        (candidate) => candidate.dataset.surfaceId === surfaceId,
      ) ?? null
    );
  }

  async function renameWorkflowDefinitionFromCurrentGraph({
    definitionId,
    description,
    name,
    workspaceId,
  }) {
    const definition = await window.setta.workflow.readDefinition(workspaceId, definitionId);
    return window.setta.workflow.updateDefinition(
      workspaceId,
      definitionId,
      name,
      description,
      definition.graph,
    );
  }

  function restoreMaximizedWorkflowGraphPane() {
    const host = document.querySelector(
      '[data-testid="workspace-pane-host"][data-surface-kind="workflow-graph"][data-maximized="true"]',
    );
    const button = host?.querySelector('[data-workspace-pane-maximize-button="true"]');
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  }

  function workflowGraphPaneState({ surfaceId = null } = {}) {
    const host = workflowGraphHostBySurfaceId(surfaceId) ?? activeWorkflowGraphHost();
    return {
      focused: host instanceof HTMLElement ? host.dataset.focused === "true" : false,
      maximized: host instanceof HTMLElement ? host.dataset.maximized === "true" : false,
      moving: host instanceof HTMLElement ? host.dataset.moving === "true" : true,
    };
  }

  function setWorkflowSettingsControlValue({ selector, surfaceSelector, value }) {
    const surface = document.querySelector(surfaceSelector);
    const element = surface?.querySelector(selector);
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      return { ok: false, reason: "missing-control" };
    }
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }

  function workflowNodeDetailsButtonState() {
    const button = workflowToolbarElement('[data-testid="workflow-node-details-button"]');
    return {
      disabled: button instanceof HTMLButtonElement ? button.disabled : true,
      text: button?.textContent?.trim() ?? "",
    };
  }

  function workflowNodeDetailsButtonRect() {
    const button = workflowToolbarElement('[data-testid="workflow-node-details-button"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-details-button" };
    }
    if (button.disabled) {
      return { ok: false, reason: "disabled-details-button" };
    }
    const rect = button.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || !elementIntersectsViewport(button)) {
      return {
        ok: false,
        reason: "details-button-not-visible",
        rect: elementRect(button),
      };
    }
    return {
      ok: true,
      height: rect.height,
      text: button.textContent?.trim() ?? "",
      width: rect.width,
      x: Math.round(clamp(rect.left + rect.width / 2, 8, window.innerWidth - 8)),
      y: Math.round(clamp(rect.top + rect.height / 2, 8, window.innerHeight - 8)),
    };
  }

  function clickWorkflowNodeDetailsButton() {
    const button = workflowToolbarElement('[data-testid="workflow-node-details-button"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, reason: "details-button-unavailable" };
    }
    button.click();
    return { ok: true };
  }

  function workflowNodeDetailsSurfaceState() {
    return {
      exists: Boolean(document.querySelector('[data-testid="workflow-node-details-surface"]')),
      hosts: [...document.querySelectorAll('[data-testid="workspace-pane-host"]')].map((host) => ({
        focused: host.getAttribute("data-focused"),
        maximized: host.getAttribute("data-maximized"),
        paneId: host.getAttribute("data-pane-id"),
        surfaceFrozen: host.getAttribute("data-surface-frozen"),
        surfaceKind: host.getAttribute("data-surface-kind"),
        surfaceVisible: host.getAttribute("data-surface-visible"),
        title: host.querySelector(".workspace-pane-title")?.textContent?.trim() ?? "",
        visible: host.getAttribute("data-visible"),
      })),
      toolbar: workflowNodeDetailsButtonState(),
    };
  }

  function workflowGraphPaneSettled({ surfaceId }) {
    const root = workflowGraphSurfaceById(surfaceId);
    const host = root?.closest('[data-testid="workspace-pane-host"]');
    return {
      ...workflowGraphCanvasLayout(root),
      moving: paneHostBoolean(host, "moving", true),
      visible: paneHostBoolean(host, "visible", false),
    };
  }

  function workflowGraphCanvasLayout(root) {
    const canvas = root?.querySelector('[data-testid="workflow-graph-canvas"]');
    if (!(canvas instanceof HTMLCanvasElement)) {
      return {
        clientHeight: 0,
        clientWidth: 0,
        height: 0,
        left: Number.NEGATIVE_INFINITY,
        width: 0,
      };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      clientHeight: canvas.clientHeight,
      clientWidth: canvas.clientWidth,
      height: rect.height,
      left: rect.left,
      width: rect.width,
    };
  }

  function paneHostBoolean(host, key, missingValue) {
    if (!(host instanceof HTMLElement)) {
      return missingValue;
    }
    return host.dataset[key] === "true";
  }

  function workflowContextMenuPosition() {
    const menu = document.querySelector('[data-testid="workflow-node-create-menu"]');
    if (!(menu instanceof HTMLElement)) {
      return { ok: false, reason: "missing-menu" };
    }
    const rect = menu.getBoundingClientRect();
    return {
      left: rect.left,
      ok: true,
      position: getComputedStyle(menu).position,
      top: rect.top,
    };
  }

  function sidebarWorkflowRows() {
    const list = document.querySelector('[data-testid="sidebar-navigation-list"]');
    if (!(list instanceof HTMLElement)) {
      return { ok: false, reason: "missing-sidebar-list" };
    }
    const rows = Array.from(list.querySelectorAll("[data-item-index]")).map((row) => ({
      section:
        row.querySelector("[data-sidebar-section]")?.getAttribute("data-sidebar-section") ?? "",
      testId: row.getAttribute("data-testid") ?? "",
      text: row.textContent?.trim().replace(/\s+/g, " ") ?? "",
    }));
    return { ok: true, rows };
  }

  async function nullWorkflowValidation({ workspaceId }) {
    return window.setta.workflow.validateDefinition(workspaceId, {
      edges: [],
      layout: { nodes: [] },
      nodes: [],
    });
  }

  async function createWorkflowProjectionFixture({ workspaceRoot }) {
    const opened = await window.setta.workspace.openPath(workspaceRoot);
    const workspaceId = opened.workspace.id;
    const graph = workflowProjectionFixtureGraph();
    const validation = await window.setta.workflow.validateDefinition(workspaceId, graph);
    if (!validation.valid) {
      throw new Error(
        `workflow projection fixture validation failed: ${JSON.stringify(validation.diagnostics)}`,
      );
    }
    const definition = await window.setta.workflow.createDefinition(
      workspaceId,
      "Workflow graph projection",
      "Renderer projection smoke fixture",
      graph,
    );
    return {
      definitionId: definition.id,
      definitionName: definition.name,
      layout: graph.layout,
      workspaceId,
    };
  }

  function workflowProjectionFixtureGraph() {
    const layout = {
      nodes: [
        { nodeId: "start", x: -360, y: 0 },
        { nodeId: "work", x: 0, y: 120 },
        { nodeId: "end", x: 360, y: 0 },
      ],
    };
    return {
      edges: [
        {
          condition: alwaysCondition(),
          fromNodeId: "start",
          id: "start_work",
          kind: "normal",
          toNodeId: "work",
        },
        {
          condition: null,
          fromNodeId: "work",
          id: "work_end",
          kind: "normal",
          toNodeId: "end",
        },
      ],
      layout,
      nodes: [
        {
          action: null,
          gateway: null,
          id: "start",
          kind: "start",
          loopGuard: null,
          title: "Start",
        },
        {
          action: {
            codex: {
              freshConversation: true,
              model: "",
              prompt: "workflow result action",
              reasoningEffort: "",
            },
            kind: "agent.codex",
          },
          gateway: null,
          id: "work",
          kind: "action",
          loopGuard: null,
          title: "Work",
        },
        {
          action: null,
          gateway: null,
          id: "end",
          kind: "end",
          loopGuard: null,
          title: "End",
        },
      ],
    };
  }

  function alwaysCondition() {
    return {
      exitCode: null,
      invert: false,
      kind: "always",
      nodeId: "",
      signalName: "",
      signalValue: "",
      status: null,
    };
  }

  async function updateWorkflowProjectionFixtureNodeTitle({
    definitionId,
    nodeId,
    title,
    workspaceId,
  }) {
    const definition = await window.setta.workflow.readDefinition(workspaceId, definitionId);
    const graph = {
      ...definition.graph,
      nodes: definition.graph.nodes.map((node) => (node.id === nodeId ? { ...node, title } : node)),
    };
    const updated = await window.setta.workflow.updateDefinition(
      workspaceId,
      definitionId,
      definition.name,
      definition.description,
      graph,
    );
    window.dispatchEvent(
      new CustomEvent(workflowDefinitionChangedEventName, {
        detail: { definitionId, workspaceId },
      }),
    );
    return {
      definitionId: updated.id,
      nodeId,
      title,
    };
  }

  async function removeWorkflowProjectionFixtureNode({ definitionId, nodeId, workspaceId }) {
    const definition = await window.setta.workflow.readDefinition(workspaceId, definitionId);
    const graph = {
      ...definition.graph,
      edges: definition.graph.edges.filter(
        (edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId,
      ),
      layout: {
        ...definition.graph.layout,
        nodes: definition.graph.layout.nodes.filter((layoutNode) => layoutNode.nodeId !== nodeId),
      },
      nodes: definition.graph.nodes.filter((node) => node.id !== nodeId),
    };
    const updated = await window.setta.workflow.updateDefinition(
      workspaceId,
      definitionId,
      definition.name,
      definition.description,
      graph,
    );
    window.dispatchEvent(
      new CustomEvent(workflowDefinitionChangedEventName, {
        detail: { definitionId, workspaceId },
      }),
    );
    return {
      definitionId: updated.id,
      nodeId,
    };
  }

  async function workflowDefinitions({ workspaceId }) {
    const response = await window.setta.workflow.listDefinitions(workspaceId);
    return response.definitions.map((definition) => ({
      id: definition.id,
      name: definition.name,
    }));
  }

  async function configureWorkflowResultAction({ definitionId, workspaceId }) {
    const definition = await window.setta.workflow.readDefinition(workspaceId, definitionId);
    const graph = {
      ...definition.graph,
      nodes: definition.graph.nodes.map((node) => {
        if (node.id !== "agent_task") {
          return node;
        }
        return {
          ...node,
          action: {
            ...node.action,
            codex: {
              ...node.action.codex,
              prompt: "workflow result action",
            },
          },
        };
      }),
    };
    return window.setta.workflow.updateDefinition(
      workspaceId,
      definitionId,
      definition.name,
      definition.description,
      graph,
    );
  }

  async function readWorkflowExecution({ executionId, workspaceId }) {
    return window.setta.workflow.readExecution(workspaceId, executionId);
  }

  function workflowGraphMenuItem() {
    return Array.from(document.querySelectorAll('button[role="menuitem"]')).find(
      (candidate) => candidate instanceof HTMLButtonElement && candidate.title === "Workflow Graph",
    );
  }

  function activeTerminalHost() {
    const hosts = Array.from(
      document.querySelectorAll(
        '[data-testid="workspace-pane-host"][data-surface-kind="terminal"]',
      ),
    ).filter((host) => host instanceof HTMLElement);
    return (
      hosts.find((host) => host.dataset.focused === "true") ??
      hosts.find((host) => terminalHostIntersectsViewport(host)) ??
      hosts[0] ??
      null
    );
  }

  function elementIntersectsViewport(candidate) {
    const rect = candidate.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.top < window.innerHeight
    );
  }

  function terminalHostIntersectsViewport(host) {
    return host.dataset.visible === "true" && elementIntersectsViewport(host);
  }

  function paneChromeEdgeFocusPoint({ paneId }) {
    const host = document.querySelector(
      `[data-testid="workspace-pane-host"][data-pane-id="${cssEscape(paneId)}"][data-visible="true"]`,
    );
    if (!(host instanceof HTMLElement)) {
      return { ok: false, reason: "missing-visible-pane-host" };
    }
    return paneChromeEdgeFocusPointForHost(host);
  }

  function paneChromeEdgeFocusPointForHost(host) {
    const rect = host.getBoundingClientRect();
    const candidates = [];
    const topY = rect.top + 15;
    for (const ratio of [0.5, 0.25, 0.75]) {
      candidates.push({ x: rect.left + rect.width * ratio, y: topY });
    }
    for (let inset = 11; inset >= 2; inset -= 1) {
      candidates.push({ x: rect.left + inset, y: topY });
      candidates.push({ x: rect.right - inset, y: topY });
    }
    for (const { x, y } of candidates) {
      const element = document.elementFromPoint(x, y);
      if (
        element instanceof Element &&
        !element.closest("[data-workspace-pane-resize-axis]") &&
        element.closest('[data-testid="workspace-pane-host"]') === host
      ) {
        return { ok: true, x, y };
      }
    }
    return { ok: false, reason: "edge-covered" };
  }

  function emptyTerminalSnapshot(exists) {
    return {
      exists,
      focused: false,
      maximized: false,
      profileId: "",
      sessionId: "",
      statusText: "",
      terminalLost: false,
      text: "",
      visible: false,
      xtermReady: false,
    };
  }

  function terminalSnapshotForHost(host) {
    return {
      exists: true,
      focused: host.dataset.focused === "true",
      maximized: host.dataset.maximized === "true",
      profileId: host.dataset.terminalProfileId ?? "",
      sessionId: host.dataset.terminalSessionId ?? "",
      statusText: host.querySelector(".workspace-terminal-status")?.textContent?.trim() ?? "",
      terminalLost: host.dataset.terminalLost === "true",
      text: rowsForTerminalHost(host),
      visible: terminalHostIntersectsViewport(host),
      xtermReady: Boolean(host.querySelector(".xterm-helper-textarea")),
    };
  }

  function rowsForTerminalHost(host) {
    return Array.from(host.querySelectorAll(".xterm-rows > div"))
      .map((row) => row.textContent ?? "")
      .join("\n");
  }

  function nextFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  function elementRect(element) {
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function elementVerticalRect(element) {
    if (!element) {
      return null;
    }
    const box = element.getBoundingClientRect();
    return {
      bottom: box.bottom,
      height: box.height,
      top: box.top,
    };
  }

  function activeElementSnapshot(element) {
    return {
      activeAriaLabel: elementAttribute(element, "aria-label"),
      activeTagName: element?.tagName ?? "",
      activeTestId: elementAttribute(element, "data-testid"),
    };
  }

  function textareaSnapshot(element) {
    if (!(element instanceof HTMLTextAreaElement)) {
      return {
        textareaDisabled: null,
        textareaExists: false,
        textareaValue: "",
      };
    }
    return {
      textareaDisabled: element.disabled,
      textareaExists: true,
      textareaValue: element.value,
    };
  }

  function elementAttribute(element, attribute) {
    return element?.getAttribute(attribute) ?? "";
  }

  function cssEscape(value) {
    if (globalThis.CSS?.escape) {
      return globalThis.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, "\\$&");
  }

  globalThis.__settaE2EDriver = {
    bodyText,
    clickButton,
    clickButtonContainingText,
    clickButtonContainingTextByRole,
    clickModelPickerButton,
    buttonReady,
    chatLayoutMetrics,
    chatTranscriptBlockOrder,
    chatTranscriptRows,
    composerFocus,
    composerReady,
    conversationRows,
    dispatchLayoutSnapshot,
    dispatchDocumentEscape,
    elementValue,
    focusTerminalTextarea,
    maximizeTerminalPane,
    modelPicker,
    modelPickerSummaryButton,
    modelPickerButtonReady,
    paneChromeEdgeFocusPoint,
    rendererWorkspace,
    scrollSidebarNavigationTo,
    selectedConversation,
    selectedModelPickerItems,
    setInputValue,
    sidebarMetrics,
    terminalPaneFocusPoint,
    terminalScrollbackSearch,
    terminalSnapshot,
    maximizeWorkflowGraphPane,
    maximizeWorkflowGraphPaneState,
    newFrameButtonOrWorkflowMenuExists,
    openWorkflowGraphToolbarMenu,
    selectWorkflowGraphMenuItem,
    version: "setta-e2e-driver-v9",
    visibleUserMessageTexts,
    visibleAssistantTexts,
    visibleWorkflowGraphCount,
    clickWorkflowNodeDetailsButton,
    clickWorkflowRunAndReadStartFrame,
    clickWorkflowToolbarButton,
    configureWorkflowResultAction,
    createWorkflowProjectionFixture,
    nullWorkflowValidation,
    openWorkflowRunSelector,
    openWorkflowToolbarAddMenu,
    readWorkflowExecution,
    renameWorkflowDefinitionFromCurrentGraph,
    removeWorkflowProjectionFixtureNode,
    restoreMaximizedWorkflowGraphPane,
    selectWorkflowNodeType,
    selectWorkflowRunSelectorRow,
    selectWorkflowToolbarNodeType,
    setWorkflowSettingsControlValue,
    sidebarWorkflowRows,
    updateWorkflowProjectionFixtureNodeTitle,
    workflowContextMenuPosition,
    workflowDefinitions,
    workflowGraphCanvasRect,
    workflowGraphCanvasRectState,
    workflowGraphDebugSnapshot,
    workflowGraphDebugSnapshotReady,
    workflowGraphMenuItemExists,
    workflowGraphPaneSettled,
    workflowGraphPaneState,
    workflowNodeDetailsButtonRect,
    workflowNodeDetailsButtonState,
    workflowNodeDetailsSurfaceState,
    workflowRunSelectorState,
    workflowToolbarButtonState,
    workflowToolbarSlotRects,
    workflowToolbarState,
    workflowValidationPanelState,
    workflowWorkspaceSessionState,
  };
})();
