/* global CustomEvent, Element, Event, HTMLButtonElement, HTMLCanvasElement, HTMLElement, HTMLInputElement, HTMLTextAreaElement, InputEvent, KeyboardEvent, document, getComputedStyle, window */

(() => {
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
          conversationId: row.getAttribute("data-conversation-id") ?? "",
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
    const surface = workflowGraphSurfaceById(surfaceId) ?? activeWorkflowGraphSurface();
    const host = surface?.closest('[data-testid="workspace-pane-host"]');
    const button = host?.querySelector('[data-workspace-pane-maximize-button="true"]');
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("workflow graph maximize button is missing");
    }
    button.click();
    return surface.dataset.surfaceId ?? null;
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
    const roots = Array.from(document.querySelectorAll('[data-testid="workflow-graph"]'));
    const root =
      surfaceId === null
        ? roots[0]
        : roots.find((candidate) => candidate.dataset.surfaceId === surfaceId);
    const canvas = root?.querySelector('[data-testid="workflow-graph-canvas"]');
    if (!canvas) {
      throw new Error("workflow graph canvas is missing");
    }
    const rect = canvas.getBoundingClientRect();
    return {
      clientHeight: canvas.clientHeight || rect.height,
      clientWidth: canvas.clientWidth || rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width,
    };
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
      roots: Array.from(document.querySelectorAll('[data-testid="workflow-graph"]')).map(
        workflowGraphRootState,
      ),
      surfaceIds,
    };
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

  const workflowToolbarButtonTestIds = [
    "workflow-settings-button",
    "workflow-add-node-button",
    "workflow-validate-button",
    "workflow-run-button",
    "workflow-show-draft-button",
    "workflow-node-details-button",
  ];

  function workflowToolbarButtonRects() {
    const toolbar = workflowToolbarElement('[data-testid="workflow-graph-toolbar"]');
    if (!(toolbar instanceof HTMLElement)) {
      return { ok: false, reason: "missing-workflow-toolbar" };
    }
    return {
      buttons: workflowToolbarButtonSnapshots(),
      ok: true,
      operationStatus: workflowToolbarOperationStatusSnapshot(),
      toolbar: elementRect(toolbar),
    };
  }

  function workflowToolbarButtonSnapshots() {
    const buttons = {};
    for (const testId of workflowToolbarButtonTestIds) {
      const button = workflowToolbarElement(`[data-testid="${testId}"]`);
      if (button instanceof HTMLButtonElement) {
        buttons[testId] = workflowToolbarButtonSnapshot(button);
      }
    }
    return buttons;
  }

  function workflowToolbarButtonSnapshot(button) {
    return {
      ariaLabel: button.getAttribute("aria-label") ?? "",
      disabled: button.disabled,
      rect: elementRect(button),
      text: compactElementText(button),
      title: button.getAttribute("title") ?? "",
    };
  }

  function workflowToolbarOperationStatusSnapshot() {
    const operationStatus = workflowToolbarElement('[data-testid="workflow-operation-status"]');
    if (!(operationStatus instanceof HTMLElement)) {
      return null;
    }
    return {
      rect: elementRect(operationStatus),
      text: compactElementText(operationStatus),
    };
  }

  function compactElementText(element) {
    return element.textContent?.trim().replace(/\s+/g, " ") ?? "";
  }

  async function clickWorkflowToolbarButtonAndReadNextFrame({ testId }) {
    const clicked = clickWorkflowToolbarButton({ testId });
    if (!clicked.ok) {
      return clicked;
    }
    await nextFrame();
    return workflowToolbarButtonRects();
  }

  function clickWorkflowToolbarButton({ testId }) {
    const button = workflowToolbarElement(`[data-testid="${testId}"]`);
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, reason: "button-unavailable" };
    }
    button.click();
    return { ok: true };
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
    return window.setta.workflow.updateDefinitionSettings({
      definitionId,
      description,
      expectedRevision: definition.draftRevision,
      name,
      workspaceId,
    });
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

  function workflowRunDetailsText() {
    const details = document.querySelector('[data-testid="workflow-node-run-details"]');
    return details?.textContent ?? "";
  }

  function workflowGraphPaneSettled({ surfaceId }) {
    const root = Array.from(document.querySelectorAll('[data-testid="workflow-graph"]')).find(
      (candidate) => candidate.dataset.surfaceId === surfaceId,
    );
    const host = root?.closest('[data-testid="workspace-pane-host"]');
    const canvas = root?.querySelector('[data-testid="workflow-graph-canvas"]');
    const rect = canvas instanceof HTMLCanvasElement ? canvas.getBoundingClientRect() : null;
    return {
      clientWidth: canvas instanceof HTMLCanvasElement ? canvas.clientWidth : 0,
      left: rect?.left ?? Number.NEGATIVE_INFINITY,
      moving: host instanceof HTMLElement ? host.dataset.moving === "true" : true,
      visible: host instanceof HTMLElement ? host.dataset.visible === "true" : false,
    };
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
          condition: null,
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

  async function workflowDefinitions({ workspaceId }) {
    const response = await window.setta.workflow.listDefinitions(workspaceId);
    return response.definitions.map((definition) => ({
      id: definition.id,
      name: definition.name,
    }));
  }

  async function configureWorkflowResultAction({ definitionId, workspaceId }) {
    const definition = await window.setta.workflow.readDefinition(workspaceId, definitionId);
    const agentTask = definition.graph.nodes.find((node) => node.id === "agent_task");
    if (!agentTask) {
      throw new Error(`agent_task node was not found: ${JSON.stringify(definition.graph.nodes)}`);
    }
    const node = {
      ...agentTask,
      action: {
        ...agentTask.action,
        codex: {
          ...agentTask.action.codex,
          prompt: "workflow result action",
        },
      },
    };
    await window.setta.workflow.updateNode({
      definitionId,
      expectedRevision: definition.draftRevision,
      node,
      workspaceId,
    });
    return window.setta.workflow.readDefinition(workspaceId, definitionId);
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
    clickModelPickerButton,
    buttonReady,
    chatLayoutMetrics,
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
    newFrameButtonOrWorkflowMenuExists,
    openWorkflowGraphToolbarMenu,
    selectWorkflowGraphMenuItem,
    version: "setta-e2e-driver-v5",
    visibleUserMessageTexts,
    visibleAssistantTexts,
    visibleWorkflowGraphCount,
    clickWorkflowNodeDetailsButton,
    clickWorkflowToolbarButtonAndReadNextFrame,
    clickWorkflowToolbarButton,
    configureWorkflowResultAction,
    createWorkflowProjectionFixture,
    nullWorkflowValidation,
    openWorkflowToolbarAddMenu,
    readWorkflowExecution,
    renameWorkflowDefinitionFromCurrentGraph,
    restoreMaximizedWorkflowGraphPane,
    selectWorkflowNodeType,
    selectWorkflowToolbarNodeType,
    setWorkflowSettingsControlValue,
    sidebarWorkflowRows,
    workflowContextMenuPosition,
    workflowDefinitions,
    workflowGraphCanvasRect,
    workflowGraphDebugSnapshot,
    workflowGraphDebugSnapshotReady,
    workflowGraphMenuItemExists,
    workflowGraphPaneSettled,
    workflowGraphPaneState,
    workflowNodeDetailsButtonRect,
    workflowNodeDetailsButtonState,
    workflowNodeDetailsSurfaceState,
    workflowRunDetailsText,
    workflowToolbarButtonRects,
    workflowToolbarState,
    workflowWorkspaceSessionState,
  };
})();
