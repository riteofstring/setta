/* global Event, HTMLButtonElement, HTMLElement, HTMLInputElement, KeyboardEvent, document, getComputedStyle, window */

(() => {
  const version = "setta-easy-button-pane-driver-v1";
  const paneHostSelector = '[data-testid="workspace-pane-host"]';

  function installEasyButtonPaneDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      easyButtonPaneClickToolbarAction,
      easyButtonPaneClickControl,
      easyButtonPaneClickStop,
      easyButtonPaneClose,
      easyButtonPaneForceFrozen,
      easyButtonPaneOpenShortcut,
      easyButtonPaneState,
      easyButtonPaneStartDirect,
      easyButtonPaneSubmitRequest,
      easyButtonPaneVersion: version,
    });
  }

  async function easyButtonPaneState() {
    const context = easyButtonContext();
    const { host, stageRect, workspaceId } = context;
    if (!(host instanceof HTMLElement)) {
      return { exists: false, stageRect: rectSnapshot(stageRect), workspaceId };
    }
    const columnRecord = await easyButtonColumnRecord(workspaceId);
    return easyButtonHostState(context, columnRecord);
  }

  function easyButtonHostState({ host, stageRect, workspaceId }, columnRecord) {
    const hostRect = host.getBoundingClientRect();
    return {
      ...easyButtonState(host),
      ...easyButtonSurfaceState(host),
      ...easyButtonHostDatasetState(host),
      exists: true,
      artifacts: easyButtonArtifacts(host),
      layoutWidthSpec: columnRecord?.widthSpec ?? null,
      railText: easyButtonRailText(host),
      rect: rectSnapshot(hostRect),
      stageRect: rectSnapshot(stageRect),
      widthRatio: easyButtonWidthRatio(hostRect, stageRect),
      workspaceId,
    };
  }

  function easyButtonSurfaceState(host) {
    const surface = host.querySelector('[data-testid="easy-button-surface"]');
    return {
      easyState: surface instanceof HTMLElement ? (surface.dataset.easyButtonState ?? "") : "",
    };
  }

  function easyButtonHostDatasetState(host) {
    return {
      focused: host.dataset.focused ?? "",
      hostFrozen: host.dataset.surfaceFrozen ?? "",
      paneChromeTitle: host.dataset.workspacePaneChromeTitle ?? "",
      paneId: host.dataset.paneId ?? "",
      surfaceKind: host.dataset.surfaceKind ?? "",
    };
  }

  function easyButtonWidthRatio(hostRect, stageRect) {
    if (stageRect.width <= 0) {
      return 0;
    }
    return hostRect.width / stageRect.width;
  }

  function easyButtonContext() {
    return {
      host: easyButtonHost(),
      stageRect: easyButtonStageRect(),
      workspaceId: currentWorkspaceId(),
    };
  }

  function currentWorkspaceId() {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    return area instanceof HTMLElement ? (area.dataset.workspaceId ?? "") : "";
  }

  function easyButtonStageRect() {
    const stage = document.querySelector('[data-testid="workspace-presentation-engine"]');
    if (stage instanceof HTMLElement) {
      return stage.getBoundingClientRect();
    }
    return { height: 0, left: 0, top: 0, width: 0 };
  }

  function easyButtonState(host) {
    const button = host.querySelector(".easy-button-control");
    const input = host.querySelector('[data-testid="easy-button-input"]');
    const requestText = host.querySelector('[data-testid="easy-button-request-text"]');
    const summary = host.querySelector('[data-testid="easy-button-summary"]');
    const agentChip = host.querySelector('[data-testid="easy-button-agent-chip"]');
    const stopButton = host.querySelector('[data-testid="easy-button-stop-button"]');
    const buttonRect = elementRectOrZero(button);
    return {
      agentChipText: elementText(agentChip),
      buttonAriaLabel: buttonAriaLabel(button),
      buttonAnimationName: buttonPseudoStyleValue(button, "animationName"),
      buttonAnimationPlayState: buttonPseudoStyleValue(button, "animationPlayState"),
      buttonRect: rectSnapshot(buttonRect),
      buttonVisible: buttonVisible(buttonRect),
      inputFocused: input instanceof HTMLInputElement && document.activeElement === input,
      inputDisabled: inputDisabled(input),
      inputValue: inputValue(input),
      requestText: elementText(requestText),
      stopButtonAriaLabel: buttonAriaLabel(stopButton),
      stopButtonDisabled: buttonDisabled(stopButton),
      stopButtonText: elementText(stopButton),
      stopButtonVisible: stopButton instanceof HTMLButtonElement,
      summaryText: elementText(summary),
    };
  }

  function elementText(element) {
    if (!(element instanceof HTMLElement)) {
      return "";
    }
    return (element.textContent ?? "").trim();
  }

  function buttonAriaLabel(button) {
    if (!(button instanceof HTMLButtonElement)) {
      return "";
    }
    return button.getAttribute("aria-label") ?? "";
  }

  function buttonPseudoStyleValue(button, property) {
    if (!(button instanceof HTMLElement)) {
      return "";
    }
    return getComputedStyle(button, "::after")[property] ?? "";
  }

  function buttonVisible(rect) {
    return rect.width > 80 && rect.height > 80;
  }

  function inputDisabled(input) {
    if (!(input instanceof HTMLInputElement)) {
      return null;
    }
    return input.disabled;
  }

  function buttonDisabled(button) {
    if (!(button instanceof HTMLButtonElement)) {
      return null;
    }
    return button.disabled;
  }

  function inputValue(input) {
    if (!(input instanceof HTMLInputElement)) {
      return "";
    }
    return input.value;
  }

  function easyButtonRailText(host) {
    return Array.from(host.querySelectorAll(".easy-button-rail"))
      .map((rail) => rail.textContent ?? "")
      .join("")
      .trim();
  }

  function easyButtonArtifacts(host) {
    return Array.from(host.querySelectorAll(".easy-button-artifact-card")).map((card) => ({
      kind: card instanceof HTMLElement ? (card.dataset.artifactKind ?? "") : "",
      text: (card.textContent ?? "").trim(),
      title: elementText(card.querySelector(".easy-button-artifact-title")),
    }));
  }

  function easyButtonPaneClickToolbarAction() {
    const menu = document.querySelector('[role="menu"][aria-label="New frame options"]');
    const button = Array.from(menu?.querySelectorAll("button") ?? []).find((candidate) =>
      candidate.textContent?.includes("Easy Button"),
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  }

  function easyButtonPaneOpenShortcut() {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        altKey: true,
        bubbles: true,
        cancelable: true,
        code: "KeyE",
        key: "e",
        metaKey: true,
      }),
    );
    return true;
  }

  function easyButtonPaneClickControl() {
    const host = easyButtonHost();
    const button = host?.querySelector('[data-testid="easy-button-control"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  }

  function easyButtonPaneClickStop() {
    const host = easyButtonHost();
    const button = host?.querySelector('[data-testid="easy-button-stop-button"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  }

  function easyButtonPaneSubmitRequest(text) {
    const host = easyButtonHost();
    const input = host?.querySelector('[data-testid="easy-button-input"]');
    if (!(input instanceof HTMLInputElement) || input.disabled) {
      return false;
    }
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) {
      return false;
    }
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.form?.requestSubmit();
    return true;
  }

  async function easyButtonPaneStartDirect(text) {
    const workspaceId = currentWorkspaceId();
    if (!workspaceId || workspaceId === "empty") {
      return { ok: false, message: "workspace is not open" };
    }
    try {
      const run = await window.setta.easyRun.start({ requestText: text, workspaceId });
      return { ok: true, run };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  function easyButtonPaneClose({ paneId }) {
    const host = Array.from(document.querySelectorAll(paneHostSelector)).find(
      (candidate) => candidate instanceof HTMLElement && candidate.dataset.paneId === paneId,
    );
    const button = host?.querySelector('[data-workspace-pane-action="close"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  }

  function easyButtonPaneForceFrozen() {
    const host = easyButtonHost();
    if (!(host instanceof HTMLElement)) {
      return false;
    }
    host.dataset.surfaceFrozen = "true";
    return true;
  }

  async function easyButtonColumnRecord(workspaceId) {
    const layout = await easyButtonLayout(workspaceId);
    const paneRecord = easyButtonPaneRecord(layout);
    return paneRecord ? easyButtonColumnForPane(layout, paneRecord.paneId) : null;
  }

  async function easyButtonLayout(workspaceId) {
    if (!workspaceId || workspaceId === "empty") {
      return null;
    }
    const layoutResult = await window.setta.workspace.readUILayout(workspaceId);
    return layoutResult?.layout ?? null;
  }

  function easyButtonPaneRecord(layout) {
    return layout?.panes.find((pane) => pane.surfaceKind === "easy-button") ?? null;
  }

  function easyButtonColumnForPane(layout, paneId) {
    return layout?.columns.find((column) => column.paneIds.includes(paneId)) ?? null;
  }

  function easyButtonHost() {
    return Array.from(document.querySelectorAll(paneHostSelector))
      .filter((candidate) => candidate instanceof HTMLElement)
      .find((candidate) => candidate.dataset.surfaceKind === "easy-button");
  }

  function rectSnapshot(rect) {
    return {
      height: Math.round(rect.height),
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
    };
  }

  function elementRectOrZero(element) {
    if (element instanceof HTMLElement) {
      return element.getBoundingClientRect();
    }
    return { height: 0, left: 0, top: 0, width: 0 };
  }

  installEasyButtonPaneDriver();
})();
