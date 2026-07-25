/* global HTMLButtonElement, HTMLElement, document, window */

(() => {
  const version = "setta-settings-page-driver-v3";
  const driver = globalThis.__settaE2EDriver;
  if (!driver) {
    throw new Error("base Setta E2E driver is not installed");
  }

  Object.assign(driver, {
    settingsPageClickBack,
    settingsPageClickDesktopSettingsButton,
    settingsPageClickMobileProjectSettingsButton,
    settingsPageClickMobileProjectToggle,
    settingsPageClickMobileSettingsButton,
    settingsPageClickSettingsButton,
    settingsPageClickShellVoiceSetup,
    settingsPageOpenBrowserPane,
    settingsPageState,
    settingsPageVersion: version,
  });

  function settingsPageClickSettingsButton() {
    return settingsPageClickDesktopSettingsButton();
  }

  function settingsPageClickDesktopSettingsButton() {
    return clickButtonBySelector('[data-testid="shell-settings-button"]');
  }

  function settingsPageClickMobileSettingsButton() {
    return clickButtonBySelector('[data-testid="workspace-mobile-settings"]');
  }

  function settingsPageClickMobileProjectToggle() {
    return clickButtonBySelector('[data-testid="workspace-mobile-project-toggle"]');
  }

  function settingsPageClickMobileProjectSettingsButton() {
    return clickButtonBySelector(
      '[data-testid="mobile-project-pane"] button[aria-label="Open settings"]',
    );
  }

  function settingsPageClickBack() {
    const button = settingsPageButtonByText("Back to workspace");
    if (!button || button.disabled) {
      return { clicked: false };
    }
    button.click();
    return { clicked: true };
  }

  function settingsPageClickShellVoiceSetup() {
    const button = elementByTestId("shell-speech-capture-control");
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { clicked: false, reason: "missing-shell-voice-setup" };
    }
    const label = button.getAttribute("aria-label") ?? "";
    button.click();
    return { clicked: true, label };
  }

  function settingsPageOpenBrowserPane() {
    const browserButton = Array.from(
      document.querySelectorAll('[role="menu"][aria-label="New frame options"] button'),
    ).find((candidate) => candidate.textContent?.trim().startsWith("Browser"));
    if (!(browserButton instanceof HTMLButtonElement) || browserButton.disabled) {
      return { clicked: false, reason: "missing-browser-action" };
    }
    browserButton.click();
    return { clicked: true };
  }

  async function settingsPageState() {
    const area = elementByTestId("workspace-layout-area");
    const workspaceShell = elementByTestId("app-workspace-shell");
    const settingsPage = elementByTestId("settings-shell-page");
    const hosts = visibleWorkspaceHosts();
    const focused = hosts.find((host) => host.dataset.focused === "true");
    const nativeViewStats = await readNativeViewStats();
    const runtime = await readRuntimeSnapshot();
    return {
      ...workspaceHostState(hosts, focused),
      ...workspaceAreaState(area),
      ...settingsShellState(settingsPage, workspaceShell),
      ...settingsChromeState(),
      ...runtimeState(runtime),
      emptyWorkspaceVisible: hasTestId("workspace-empty-state"),
      layoutRecoveryVisible: hasTestId("workspace-layout-recovery"),
      nativeViewStats,
    };
  }

  function settingsChromeState() {
    return {
      mobileBarVisible: hasTestId("workspace-mobile-bar"),
      mobileProjectPaneVisible: hasTestId("mobile-project-pane"),
      shellTopBarVisible: hasTestId("shell-top-bar"),
    };
  }

  function runtimeState(runtime) {
    const activeRuntime = activeRuntimeFromSnapshot(runtime);
    return {
      runtimeActiveIsLocal: activeRuntime?.isLocal ?? null,
      runtimeActiveName: activeRuntime?.displayName ?? "",
      runtimeConnectionStatus: runtime?.connection?.status ?? "",
    };
  }

  function activeRuntimeFromSnapshot(runtime) {
    if (!runtime || !Array.isArray(runtime.runtimes)) {
      return null;
    }
    return runtime.runtimes.find((item) => item.active) ?? null;
  }

  function workspaceHostState(hosts, focused) {
    const surfaceKinds = hosts.map((host) => host.dataset.surfaceKind ?? "");
    return {
      browserVisible: surfaceKinds.includes("browser"),
      focusedPaneId: focused?.dataset.paneId ?? "",
      focusedSurfaceKind: focused?.dataset.surfaceKind ?? "",
      paneIds: hosts.map((host) => host.dataset.paneId ?? ""),
      surfaceKinds,
    };
  }

  function workspaceAreaState(area) {
    return {
      browserPaneCount: Number(dataValue(area, "browserPaneCount", "0")),
      compactLayout: dataValue(area, "compactLayout", ""),
      maximizedPaneId: dataValue(area, "maximizedPaneId", ""),
      nativeViewOverlayActive: dataFlag(area, "nativeViewOverlayActive"),
      paneCount: Number(dataValue(area, "paneCount", "0")),
      presentationMode: dataValue(area, "presentationMode", ""),
      workspaceId: dataValue(area, "workspaceId", ""),
    };
  }

  function settingsShellState(settingsPage, workspaceShell) {
    const activeSettingsTab = document.querySelector('[role="tab"][aria-selected="true"]');
    const openAIVoiceCard = elementByTestId("openai-voice-connection-card");
    const voiceProviderCard = elementByTestId("speech-provider-selection-card");
    return {
      activeSettingsSubtab:
        activeSettingsTab instanceof HTMLElement
          ? activeSettingsTab.id.replace("settings-subtab-", "")
          : "",
      openAIVoiceCardFocused: document.activeElement === openAIVoiceCard,
      openAIVoiceCardVisible: openAIVoiceCard !== null,
      settingsBackVisible: Boolean(settingsPageButtonByText("Back to workspace")),
      settingsPageCoversViewport: coversViewport(settingsPage),
      settingsPageOpen: settingsPage !== null,
      settingsPageRole: settingsPage?.getAttribute("role") ?? "",
      settingsPanelReady: Boolean(document.querySelector("#settings-subtab-theme")),
      voiceProviderCardFocused: document.activeElement === voiceProviderCard,
      voiceProviderCardVisible: voiceProviderCard !== null,
      workspaceShellHidden: workspaceShell?.getAttribute("aria-hidden") === "true",
      workspaceShellInert: Boolean(workspaceShell?.hasAttribute("inert")),
    };
  }

  function visibleWorkspaceHosts() {
    return Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]')).filter(
      (host) =>
        host instanceof HTMLElement &&
        host.dataset.visible === "true" &&
        (host.dataset.surfaceKind ?? "") !== "",
    );
  }

  function clickButtonBySelector(selector) {
    const button = document.querySelector(selector);
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { clicked: false, selector };
    }
    button.click();
    return { clicked: true, selector };
  }

  function settingsPageButtonByText(text) {
    const page = document.querySelector('[data-testid="settings-shell-page"]');
    const button = Array.from(page?.querySelectorAll("button") ?? []).find(
      (candidate) => candidate.textContent?.trim() === text,
    );
    return button instanceof HTMLButtonElement ? button : null;
  }

  function elementByTestId(testId) {
    const element = document.querySelector(`[data-testid="${testId}"]`);
    return element instanceof HTMLElement ? element : null;
  }

  function hasTestId(testId) {
    return elementByTestId(testId) !== null;
  }

  function dataValue(element, key, fallback) {
    return element?.dataset[key] ?? fallback;
  }

  function dataFlag(element, key) {
    return element instanceof HTMLElement && element.dataset[key] === "true";
  }

  function coversViewport(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return (
      Math.abs(rect.left) <= 1 &&
      Math.abs(rect.top) <= 1 &&
      Math.abs(rect.width - window.innerWidth) <= 1 &&
      Math.abs(rect.height - window.innerHeight) <= 1
    );
  }

  async function readNativeViewStats() {
    try {
      return (await window.setta?.workspaceNativeViews?.readBrowserViewStats?.()) ?? null;
    } catch {
      return null;
    }
  }

  async function readRuntimeSnapshot() {
    try {
      return (await window.setta?.runtimes?.current?.()) ?? null;
    } catch {
      return null;
    }
  }
})();
