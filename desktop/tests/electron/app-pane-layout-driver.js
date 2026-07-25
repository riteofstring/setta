/* global CustomEvent, Event, HTMLButtonElement, HTMLElement, HTMLInputElement, HTMLTextAreaElement, InputEvent, KeyboardEvent, document, window */

(() => {
  const version = "setta-app-pane-layout-driver-v4";
  const conversationPaneNavigationRequestEvent = "setta:conversation-pane-navigation-request";
  let roundTripPromise = null;

  function installAppPaneLayoutDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      appPaneLayoutClickFocusedMaximize,
      appPaneLayoutCloseConversationPane,
      appPaneLayoutConversationPaneState,
      appPaneLayoutCreateFolderlessConversationFromMaster,
      appPaneLayoutMasterFocusState,
      appPaneLayoutOpenConversationFromMaster,
      appPaneLayoutPaneInvariantState,
      appPaneLayoutPersistedShellState,
      appPaneLayoutPressMasterFocusShortcut,
      appPaneLayoutReopenFolderlessConversation,
      appPaneLayoutRoundTrip,
      appPaneLayoutShellState,
      appPaneLayoutSubmitFolderlessConversationText,
      appPaneLayoutSubmitMasterText,
      appPaneLayoutTranscriptState,
      appPaneLayoutVersion: version,
    });
  }

  function appPaneLayoutRoundTrip(args) {
    roundTripPromise ??= runAppPaneLayoutRoundTrip(args);
    return roundTripPromise;
  }

  function appPaneLayoutShellState() {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const hosts = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]'))
      .filter((host) => host instanceof HTMLElement && host.dataset.paneId)
      .map((host) => ({
        focused: host.dataset.focused ?? "",
        maximized: host.dataset.maximized ?? "",
        paneId: host.dataset.paneId ?? "",
        surfaceKind: host.dataset.surfaceKind ?? "",
        visible: host.dataset.visible ?? "",
      }));
    const visibleHosts = hosts.filter((host) => host.visible === "true");
    return {
      hosts,
      legacyProjectShellPresent: legacyProjectShellPresent(),
      masterPaneCount: visibleHosts.filter((host) => host.surfaceKind === "master").length,
      maximizedPaneId: area instanceof HTMLElement ? (area.dataset.maximizedPaneId ?? "") : "",
      paneCount: area instanceof HTMLElement ? (area.dataset.paneCount ?? "") : "",
      ready: area instanceof HTMLElement,
      workspaceId: area instanceof HTMLElement ? (area.dataset.workspaceId ?? "") : "",
    };
  }

  async function appPaneLayoutPaneInvariantState() {
    const shell = appPaneLayoutShellState();
    const api = appLayoutAPI();
    if (api.status === "failed") {
      return {
        ...shell,
        persistedConversationPaneCount: -1,
        persistedMasterPaneCount: -1,
        status: "failed",
      };
    }
    const read = await api.readPaneLayout();
    const panes = read.layout?.panes ?? [];
    return {
      ...shell,
      persistedConversationPaneCount: panes.filter((pane) => pane.surfaceKind === "conversation")
        .length,
      persistedMasterPaneCount: panes.filter((pane) => pane.surfaceKind === "master").length,
      status: "ready",
    };
  }

  function legacyProjectShellPresent() {
    return Boolean(
      document.querySelector(
        [
          '[data-testid="project-pane"]',
          '[data-testid="project-sidebar-toggle"]',
          '[data-testid="workspace-sidebar"]',
          '[data-testid="workspace-selector"]',
        ].join(", "),
      ),
    );
  }

  function appPaneLayoutClickFocusedMaximize() {
    const focusedHost = document.querySelector(
      '[data-testid="workspace-pane-host"][data-focused="true"]',
    );
    const button =
      focusedHost instanceof HTMLElement
        ? focusedHost.querySelector('[data-workspace-pane-action="maximize"]')
        : null;
    if (!(button instanceof HTMLButtonElement)) {
      return { clicked: false, reason: "missing-maximize-button" };
    }
    if (button.disabled) {
      return { clicked: false, reason: "disabled-maximize-button" };
    }
    button.click();
    return { clicked: true, reason: "clicked" };
  }

  function appPaneLayoutPressMasterFocusShortcut() {
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "k",
    });
    window.dispatchEvent(event);
    return {
      defaultPrevented: event.defaultPrevented,
      state: appPaneLayoutMasterFocusState(),
    };
  }

  function appPaneLayoutMasterFocusState() {
    const state = appPaneLayoutShellState();
    const masterHost = document.querySelector(
      '[data-testid="workspace-pane-host"][data-surface-kind="master"][data-visible="true"]',
    );
    const composer =
      masterHost instanceof HTMLElement
        ? masterHost.querySelector(
            '[data-testid="master-pane-surface"] textarea[aria-label="Ask Setta"]',
          )
        : null;
    return {
      ...state,
      masterComposerFocused: document.activeElement === composer,
      masterOverlayOpen: Boolean(document.querySelector('[data-testid="master-overlay"]')),
    };
  }

  async function appPaneLayoutCreateFolderlessConversationFromMaster() {
    const button = document.querySelector(
      '[data-testid="master-pane-surface"] [data-testid="master-new-conversation-button"]',
    );
    if (!(button instanceof HTMLButtonElement)) {
      return { reason: "missing-master-new-conversation-button", status: "failed" };
    }
    if (button.disabled) {
      return { reason: "disabled-master-new-conversation-button", status: "failed" };
    }
    button.click();
    return waitForFolderlessConversationPane();
  }

  async function appPaneLayoutSubmitMasterText({ expectedResultKind = "answer_global", text }) {
    const composer = masterPaneComposer();
    if (!(composer instanceof HTMLTextAreaElement)) {
      return { reason: "missing-master-pane-composer", status: "failed" };
    }
    setTextareaValue(composer, text);
    composer.focus();
    const send = masterPaneSurface()?.querySelector('button[aria-label="Send to Setta"]');
    if (!(send instanceof HTMLButtonElement)) {
      return { reason: "missing-master-send-button", status: "failed" };
    }
    if (send.disabled) {
      return { reason: "disabled-master-send-button", status: "failed" };
    }
    send.click();
    return waitForMasterRoutingResult({ expectedResultKind, text });
  }

  function masterPaneComposer() {
    return masterPaneSurface()?.querySelector('textarea[aria-label="Ask Setta"]') ?? null;
  }

  function masterPaneSurface() {
    const surface = document.querySelector('[data-testid="master-pane-surface"]');
    return surface instanceof HTMLElement ? surface : null;
  }

  function setTextareaValue(textarea, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function waitForMasterRoutingResult({ expectedResultKind, text }) {
    const deadline = Date.now() + 10_000;
    let state = masterRoutingResultState({ expectedResultKind, text });
    while (state.status !== "passed" && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      state = masterRoutingResultState({ expectedResultKind, text });
    }
    return state.status === "passed" ? state : { ...state, status: "failed" };
  }

  function masterRoutingResultState({ expectedResultKind, text }) {
    const interaction = masterActiveInteraction();
    const result = interaction?.querySelector("[data-master-result-kind]") ?? null;
    const requestText = masterInteractionText(
      interaction,
      '[data-testid="master-active-request"] p',
    );
    const resultKind = elementAttribute(result, "data-master-result-kind");
    const inputId = masterInteractionInputId(interaction);
    const resultText = elementText(result);
    const passed = masterRoutingResultPassed({
      expectedResultKind,
      inputId,
      requestText,
      resultKind,
      text,
    });
    return {
      inputId,
      requestText,
      resultKind,
      resultText,
      status: passed ? "passed" : "pending",
    };
  }

  function masterActiveInteraction() {
    return masterPaneSurface()?.querySelector('[data-testid="master-active-interaction"]') ?? null;
  }

  function masterInteractionText(interaction, selector) {
    return elementText(interaction?.querySelector(selector) ?? null);
  }

  function masterInteractionInputId(interaction) {
    if (!(interaction instanceof HTMLElement)) {
      return "";
    }
    return interaction.dataset.masterInputId ?? "";
  }

  function elementText(element) {
    return element?.textContent ?? "";
  }

  function elementAttribute(element, attribute) {
    return element?.getAttribute(attribute) ?? "";
  }

  function masterRoutingResultPassed({
    expectedResultKind,
    inputId,
    requestText,
    resultKind,
    text,
  }) {
    return inputId.length > 0 && requestText === text && resultKind === expectedResultKind;
  }

  function appPaneLayoutTranscriptState({ replyText, userText }) {
    const entries = masterTranscriptEntries();
    return {
      assistantReplyPresent: entries.some(
        (entry) => entry.kind === "assistant_reply" && entry.text.includes(replyText),
      ),
      entries,
      entryCount: entries.length,
      status: "ready",
      userInputPresent: entries.some(
        (entry) => entry.kind === "user_input" && entry.text.includes(userText),
      ),
    };
  }

  function masterTranscriptEntries() {
    return Array.from(document.querySelectorAll('[data-testid="master-transcript-entry"]'))
      .filter((entry) => entry instanceof HTMLElement)
      .map((entry) => ({
        kind: entry.dataset.masterTranscriptKind ?? "",
        text: entry.textContent ?? "",
      }));
  }

  async function appPaneLayoutOpenConversationFromMaster({ conversationId }) {
    const topicsButton = document.querySelector(
      '[data-testid="master-pane-surface"] [data-testid="master-topics-button"]',
    );
    if (!(topicsButton instanceof HTMLButtonElement)) {
      return { reason: "missing-master-topics-button", status: "failed" };
    }
    if (topicsButton.getAttribute("aria-expanded") !== "true") {
      topicsButton.click();
    }
    const row = await waitForMasterConversationPickerRow(conversationId);
    if (!(row instanceof HTMLButtonElement)) {
      return masterConversationPickerRowState(conversationId, "failed");
    }
    row.click();
    return waitForConversationPaneOpen(conversationId);
  }

  async function appPaneLayoutReopenFolderlessConversation({ conversationId, title }) {
    const detail = {
      completion: null,
      request: {
        conversationId,
        resourceBindings: [],
        title: title || "New conversation",
        workspaceId: "empty",
      },
    };
    window.dispatchEvent(new CustomEvent(conversationPaneNavigationRequestEvent, { detail }));
    if (!detail.completion) {
      return { reason: "missing-conversation-navigation-handler", status: "failed" };
    }
    let presentation;
    try {
      presentation = await detail.completion;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        reason: "conversation-navigation-failed",
        status: "failed",
      };
    }
    if (presentation.kind !== "opened" && presentation.kind !== "focused") {
      return { presentation, reason: "conversation-navigation-blocked", status: "failed" };
    }
    return waitForConversationPaneOpen(conversationId);
  }

  async function waitForMasterConversationPickerRow(conversationId) {
    const deadline = Date.now() + 5000;
    let row = masterConversationPickerRow(conversationId);
    while (!(row instanceof HTMLButtonElement) && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      row = masterConversationPickerRow(conversationId);
    }
    if (row instanceof HTMLButtonElement && !row.disabled) {
      return row;
    }
    return null;
  }

  function masterConversationPickerRow(conversationId) {
    return Array.from(document.querySelectorAll('[data-testid="master-conversation-picker-row"]'))
      .filter((row) => row instanceof HTMLButtonElement)
      .find((row) => row.dataset.conversationId === conversationId);
  }

  function masterConversationPickerRowState(conversationId, status) {
    const panel = document.querySelector('[data-testid="master-conversation-picker-panel"]');
    return {
      conversationId,
      panelPresent: panel instanceof HTMLElement,
      rowCount: document.querySelectorAll('[data-testid="master-conversation-picker-row"]').length,
      status,
    };
  }

  async function waitForConversationPaneOpen(conversationId) {
    const deadline = Date.now() + 5000;
    let state = await conversationPaneOpenState(conversationId);
    while (state.status !== "passed" && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      state = await conversationPaneOpenState(conversationId);
    }
    return state.status === "passed" ? state : { ...state, status: "failed" };
  }

  async function conversationPaneOpenState(conversationId) {
    const state = appPaneLayoutConversationPaneState({ conversationId });
    const api = appLayoutAPI();
    if (api.status === "failed") {
      return { ...state, ...api };
    }
    const read = await api.readPaneLayout();
    const persistedPane = persistedConversationPane(read.layout, conversationId);
    if (!state.open || !state.visible || !persistedPane) {
      return {
        ...state,
        persisted: Boolean(persistedPane),
        reason: "conversation-pane-not-open",
        status: "pending",
      };
    }
    return {
      ...state,
      persisted: true,
      resourceRoot: persistedConversationPaneResourceRoot(persistedPane),
      status: "passed",
    };
  }

  async function appPaneLayoutCloseConversationPane({ conversationId }) {
    const host = conversationPaneHost(conversationId);
    if (!(host instanceof HTMLElement)) {
      return { conversationId, reason: "missing-conversation-pane-host", status: "failed" };
    }
    const button = host.querySelector('[data-workspace-pane-action="close"]');
    if (!(button instanceof HTMLButtonElement)) {
      return {
        conversationId,
        paneId: host.dataset.paneId ?? "",
        reason: "missing-close-button",
        status: "failed",
      };
    }
    if (button.disabled) {
      return {
        conversationId,
        paneId: host.dataset.paneId ?? "",
        reason: "disabled-close-button",
        status: "failed",
      };
    }
    const paneId = host.dataset.paneId ?? "";
    button.click();
    return waitForConversationPaneClosed({ conversationId, paneId });
  }

  async function waitForConversationPaneClosed({ conversationId, paneId }) {
    const deadline = Date.now() + 5000;
    let state = await conversationPaneClosedState({ conversationId, paneId });
    while (state.status !== "passed" && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      state = await conversationPaneClosedState({ conversationId, paneId });
    }
    return state.status === "passed" ? state : { ...state, status: "failed" };
  }

  async function conversationPaneClosedState({ conversationId, paneId }) {
    const shell = appPaneLayoutShellState();
    const api = appLayoutAPI();
    if (api.status === "failed") {
      return { ...api, conversationId, paneId };
    }
    const read = await api.readPaneLayout();
    const panes = read.layout?.panes ?? [];
    const persistedConversationPaneCount = panes.filter(
      (pane) =>
        pane.surfaceKind === "conversation" &&
        pane.conversationConfig?.conversationId === conversationId,
    ).length;
    const persistedMasterPaneCount = panes.filter((pane) => pane.surfaceKind === "master").length;
    const liveConversationPaneCount = conversationPaneHosts(conversationId).length;
    const passed = conversationPaneClosedInvariantPassed({
      legacyProjectShellPresent: shell.legacyProjectShellPresent,
      liveConversationPaneCount,
      masterPaneCount: shell.masterPaneCount,
      persistedConversationPaneCount,
      persistedMasterPaneCount,
    });
    return {
      conversationId,
      legacyProjectShellPresent: shell.legacyProjectShellPresent,
      liveConversationPaneCount,
      masterPaneCount: shell.masterPaneCount,
      paneId,
      persistedConversationPaneCount,
      persistedMasterPaneCount,
      reason: passed ? "closed" : "conversation-pane-still-open",
      status: passed ? "passed" : "pending",
    };
  }

  function conversationPaneClosedInvariantPassed({
    legacyProjectShellPresent,
    liveConversationPaneCount,
    masterPaneCount,
    persistedConversationPaneCount,
    persistedMasterPaneCount,
  }) {
    return (
      liveConversationPaneCount === 0 &&
      persistedConversationPaneCount === 0 &&
      masterPaneCount === 1 &&
      persistedMasterPaneCount === 1 &&
      !legacyProjectShellPresent
    );
  }

  function appPaneLayoutConversationPaneState({ conversationId }) {
    const host = conversationPaneHost(conversationId);
    const surface =
      host instanceof HTMLElement
        ? host.querySelector('[data-testid="easy-button-surface"]')
        : null;
    return {
      conversationId,
      focused: host instanceof HTMLElement ? host.dataset.focused === "true" : false,
      open: host instanceof HTMLElement,
      paneId: host instanceof HTMLElement ? (host.dataset.paneId ?? "") : "",
      projectionStatus:
        surface instanceof HTMLElement ? (surface.dataset.easyButtonProjection ?? "") : "",
      visible: host instanceof HTMLElement ? host.dataset.visible === "true" : false,
    };
  }

  function conversationPaneHost(conversationId) {
    return conversationPaneHosts(conversationId)[0] ?? null;
  }

  function conversationPaneSurface(conversationId) {
    const host = conversationPaneHost(conversationId);
    return host instanceof HTMLElement
      ? host.querySelector('[data-testid="easy-button-surface"]')
      : null;
  }

  function conversationPaneHosts(conversationId) {
    return Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]'))
      .filter((host) => host instanceof HTMLElement && host.dataset.visible === "true")
      .filter((host) => host.dataset.surfaceKind === "conversation")
      .filter((host) => {
        const surface = host.querySelector('[data-testid="easy-button-surface"]');
        return surface instanceof HTMLElement && surface.dataset.conversationId === conversationId;
      });
  }

  async function waitForFolderlessConversationPane() {
    const deadline = Date.now() + 5000;
    let state = await folderlessConversationPaneState();
    while (state.status !== "passed" && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      state = await folderlessConversationPaneState();
    }
    return state.status === "passed" ? state : { ...state, status: "failed" };
  }

  async function folderlessConversationPaneState() {
    const surface = document.querySelector(
      '[data-testid="workspace-pane-host"][data-surface-kind="conversation"] [data-testid="easy-button-surface"][data-easy-button-projection="unloaded"]',
    );
    if (!(surface instanceof HTMLElement)) {
      return { reason: "missing-folderless-conversation-surface", status: "pending" };
    }
    const interactionState = folderlessConversationInitialInteractionState(surface);
    if (interactionState.status !== "ready") {
      return interactionState;
    }
    const api = appLayoutAPI();
    if (api.status === "failed") {
      return api;
    }
    const read = await api.readPaneLayout();
    return persistedFolderlessConversationPaneState(
      read.layout,
      surface.dataset.conversationId ?? "",
    );
  }

  function folderlessConversationInitialInteractionState(surface) {
    const folderResource = surface.querySelector('[data-testid="easy-button-folder-resource"]');
    if (folderResource instanceof HTMLElement) {
      return { reason: "unexpected-folder-resource-request", status: "failed" };
    }
    const input = surface.querySelector('[data-testid="easy-button-input"]');
    if (!(input instanceof HTMLInputElement)) {
      return { reason: "missing-folderless-conversation-input", status: "pending" };
    }
    if (input.disabled) {
      return { reason: "disabled-folderless-conversation-input", status: "failed" };
    }
    return { status: "ready" };
  }

  async function appPaneLayoutSubmitFolderlessConversationText({ conversationId, text }) {
    const surface = conversationPaneSurface(conversationId);
    const input = surface?.querySelector('[data-testid="easy-button-input"]');
    if (!(input instanceof HTMLInputElement)) {
      return { conversationId, reason: "missing-folderless-conversation-input", status: "failed" };
    }
    if (input.disabled || !input.form) {
      return {
        conversationId,
        inputDisabled: input.disabled,
        reason: "folderless-conversation-input-unavailable",
        status: "failed",
      };
    }
    setInputValue(input, text);
    input.form.requestSubmit();
    return waitForFolderlessConversationResourceRequest({ conversationId, text });
  }

  async function waitForFolderlessConversationResourceRequest({ conversationId, text }) {
    const deadline = Date.now() + 5000;
    let state = folderlessConversationResourceRequestState({ conversationId, text });
    while (state.status !== "passed" && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      state = folderlessConversationResourceRequestState({ conversationId, text });
    }
    return state.status === "passed" ? state : { ...state, status: "failed" };
  }

  function folderlessConversationResourceRequestState({ conversationId, text }) {
    const surface = conversationPaneSurface(conversationId);
    const input = surface?.querySelector('[data-testid="easy-button-input"]');
    const folderResource = surface?.querySelector('[data-testid="easy-button-folder-resource"]');
    const inputAvailable = input instanceof HTMLInputElement && !input.disabled;
    const inputValue = input instanceof HTMLInputElement ? input.value : "";
    const passed = [
      surface instanceof HTMLElement,
      folderResource instanceof HTMLButtonElement,
      inputAvailable,
      inputValue === text,
    ].every(Boolean);
    return {
      conversationId,
      folderResourceRequestPresent: folderResource instanceof HTMLElement,
      inputAvailable,
      inputValue,
      reason: passed ? "folder-resource-requested" : "folder-resource-request-not-ready",
      status: passed ? "passed" : "pending",
    };
  }

  function persistedFolderlessConversationPaneState(layout, conversationId) {
    const persistedPane = layout?.panes.find(
      (pane) =>
        pane.surfaceKind === "conversation" &&
        pane.conversationConfig.conversationId === conversationId,
    );
    const resourceBindings = persistedPane?.conversationConfig?.resourceBindings;
    if (!Array.isArray(resourceBindings) || resourceBindings.length !== 0) {
      return {
        conversationId,
        reason: "folderless-resource-bindings-not-persisted",
        resourceBindings,
        status: "pending",
      };
    }
    return {
      conversationId,
      paneId: persistedPane.paneId,
      status: "passed",
    };
  }

  async function appPaneLayoutPersistedShellState({ workspaceRoot }) {
    const api = appLayoutAPI();
    if (api.status === "failed") {
      return appPaneLayoutPersistedShellAPIFailure(api, workspaceRoot);
    }
    const read = await api.readPaneLayout();
    return appPaneLayoutPersistedState(read.layout, workspaceRoot);
  }

  function appPaneLayoutPersistedShellAPIFailure(api, workspaceRoot) {
    return { ...api, columns: [], workspaceRoot };
  }

  function appPaneLayoutPersistedState(layout, workspaceRoot) {
    if (!layout) {
      return appPaneLayoutMissingPersistedState(workspaceRoot);
    }
    const conversation = layout.panes.find((pane) => pane.paneId === "app_shell_conversation");
    return {
      columns: appPaneLayoutPersistedColumns(layout.columns),
      focusedPaneId: layout.focusedPaneId,
      maximizedPaneId: layout.maximizedPaneId,
      resourceRoot: appPaneLayoutPersistedResourceRoot(conversation),
      surfaceKind: conversation ? conversation.surfaceKind : "",
      workspaceRoot,
    };
  }

  function appPaneLayoutMissingPersistedState(workspaceRoot) {
    return {
      columns: [],
      focusedPaneId: "",
      maximizedPaneId: "__missing__",
      resourceRoot: "",
      surfaceKind: "",
      workspaceRoot,
    };
  }

  function appPaneLayoutPersistedColumns(columns) {
    return columns.map((column) => ({
      columnId: column.columnId,
      index: column.index,
      slotIndex: column.slotIndex,
    }));
  }

  function appPaneLayoutPersistedResourceRoot(pane) {
    if (!pane || pane.surfaceKind !== "conversation") {
      return "";
    }
    const folderBinding = pane.conversationConfig.resourceBindings.find(
      (binding) => binding.kind === "folder",
    );
    return folderBinding ? folderBinding.folder.rootPath : "";
  }

  function persistedConversationPane(layout, conversationId) {
    return layout?.panes.find(
      (pane) =>
        pane.surfaceKind === "conversation" &&
        pane.conversationConfig?.conversationId === conversationId,
    );
  }

  function persistedConversationPaneResourceRoot(pane) {
    const folderBinding = pane.conversationConfig.resourceBindings.find(
      (binding) => binding.kind === "folder",
    );
    return folderBinding ? folderBinding.folder.rootPath : "";
  }

  async function runAppPaneLayoutRoundTrip({ conversationId, workspaceRoot }) {
    const api = appLayoutAPI();
    if (api.status === "failed") {
      return api;
    }
    const initial = await api.readPaneLayout();
    const initialFailure = appPaneLayoutInitialFailure(initial);
    if (initialFailure) {
      return initialFailure;
    }
    const layout = appPaneLayout({ conversationId, workspaceRoot });
    const saved = await api.savePaneLayout(layout);
    const readBack = await api.readPaneLayout();
    return appPaneLayoutRoundTripResult(layout, saved, readBack);
  }

  function appLayoutAPI() {
    const api = window.setta?.appLayout;
    if (!api) {
      return { reason: "missing-app-layout-api", status: "failed" };
    }
    return api;
  }

  function appPaneLayoutInitialFailure(initial) {
    if (initial.layout === null) {
      return null;
    }
    return { initial, reason: "unexpected-initial-layout", status: "failed" };
  }

  function appPaneLayoutRoundTripResult(layout, saved, readBack) {
    if (saved.focusedPaneId !== layout.focusedPaneId) {
      return { reason: "saved-focus-mismatch", saved, status: "failed" };
    }
    return appPaneLayoutReadBackResult(layout, readBack);
  }

  function appPaneLayoutReadBackResult(layout, readBack) {
    if (readBack.layout?.focusedPaneId !== layout.focusedPaneId) {
      return { readBack, reason: "read-focus-mismatch", status: "failed" };
    }
    if (readBack.layout?.panes?.[1]?.surfaceKind !== "conversation") {
      return { readBack, reason: "conversation-pane-missing", status: "failed" };
    }
    return { readBack, status: "passed" };
  }

  function appPaneLayout({ conversationId, workspaceRoot }) {
    return {
      columns: [
        {
          columnId: "app_column_0",
          idealWidthSpec: { unit: "px", value: 640 },
          index: 0,
          paneIds: ["app_pane_master", "app_pane_conversation"],
          planeIndex: 0,
          previousProportionWidth: null,
          slotIndex: 0,
          widthSpec: { unit: "px", value: 720 },
        },
      ],
      focusedPaneId: "app_pane_master",
      maximizedPaneId: "app_pane_master",
      panes: [
        {
          columnId: "app_column_0",
          conversationConfig: null,
          heat: 0,
          masterConfig: {},
          paneId: "app_pane_master",
          sequence: 0,
          subtitle: "Global coordinator",
          surfaceId: "app_surface_master",
          surfaceKind: "master",
          title: "Setta",
          tone: "slate",
          weight: 1.6,
        },
        {
          columnId: "app_column_0",
          conversationConfig: {
            conversationId,
            presentationIdentity: {
              subtitle: "Topic conversation",
              title: "Workflow topic",
              tone: "cyan",
            },
            resourceBindings: [{ folder: { rootPath: workspaceRoot }, kind: "folder" }],
          },
          heat: 37,
          masterConfig: null,
          paneId: "app_pane_conversation",
          sequence: 1,
          subtitle: "Topic conversation",
          surfaceId: "app_surface_conversation",
          surfaceKind: "conversation",
          title: "Workflow topic",
          tone: "cyan",
          weight: 1,
        },
      ],
      schemaVersion: 1,
    };
  }

  installAppPaneLayoutDriver();
})();
