/* global HTMLButtonElement, HTMLElement, document */

(() => {
  const version = "setta-settings-page-driver-v1";
  const driver = globalThis.__settaE2EDriver;
  if (!driver) {
    throw new Error("base Setta E2E driver is not installed");
  }

  Object.assign(driver, {
    settingsPageClickBack,
    settingsPageClickSettingsButton,
    settingsPageOpenBrowserPane,
    settingsPageState,
    settingsPageVersion: version,
  });

  function settingsPageClickSettingsButton() {
    const button = buttonByAriaLabel("Open settings");
    if (!button || button.disabled) {
      return { clicked: false };
    }
    button.click();
    return { clicked: true };
  }

  function settingsPageClickBack() {
    const button = settingsPageButtonByText("Back to workspace");
    if (!button || button.disabled) {
      return { clicked: false };
    }
    button.click();
    return { clicked: true };
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

  function settingsPageState() {
    const area = elementByTestId("workspace-layout-area");
    const workspaceShell = elementByTestId("app-workspace-shell");
    const settingsPage = elementByTestId("settings-shell-page");
    const hosts = visibleWorkspaceHosts();
    const focused = hosts.find((host) => host.dataset.focused === "true");
    return {
      ...workspaceHostState(hosts, focused),
      ...workspaceAreaState(area),
      ...settingsShellState(settingsPage, workspaceShell),
      emptyWorkspaceVisible: hasTestId("workspace-empty-state"),
      layoutRecoveryVisible: hasTestId("workspace-layout-recovery"),
    };
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
      nativeViewOverlayActive: dataFlag(area, "nativeViewOverlayActive"),
      paneCount: Number(dataValue(area, "paneCount", "0")),
      workspaceId: dataValue(area, "workspaceId", ""),
    };
  }

  function settingsShellState(settingsPage, workspaceShell) {
    return {
      settingsBackVisible: Boolean(settingsPageButtonByText("Back to workspace")),
      settingsPageOpen: settingsPage !== null,
      settingsPanelReady: Boolean(document.querySelector("#settings-subtab-theme")),
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

  function buttonByAriaLabel(label) {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.getAttribute("aria-label") === label,
    );
    return button instanceof HTMLButtonElement ? button : null;
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
})();
