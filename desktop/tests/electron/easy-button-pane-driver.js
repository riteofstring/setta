/* global Element, Event, HTMLButtonElement, HTMLElement, HTMLInputElement, KeyboardEvent, document, getComputedStyle, window */

(() => {
  const version = "setta-easy-button-pane-driver-v3";
  const paneHostSelector = '[data-testid="workspace-pane-host"]';

  let easyRunEventLog = [];
  let stopEasyRunEventLog = null;

  function installEasyButtonPaneDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      easyButtonPaneClickToolbarAction,
      easyButtonPaneChatRecord,
      easyButtonPaneClickControl,
      easyButtonPaneClickStop,
      easyButtonPaneClose,
      easyButtonPaneForceFrozen,
      easyButtonPaneEventLog,
      easyButtonPaneOpenShortcut,
      easyButtonPaneResetEventLog,
      easyButtonPaneState,
      easyButtonPaneStartDirect,
      easyButtonPaneSubmitRequest,
      easyButtonPaneVersion: version,
      easyButtonPinAnimations,
      easyButtonPixelMatchMetrics,
    });
  }

  function easyButtonPaneEventLog() {
    return easyRunEventLog;
  }

  function easyButtonPaneResetEventLog() {
    easyRunEventLog = [];
    if (stopEasyRunEventLog === null) {
      stopEasyRunEventLog = window.setta.easyRun.onEvent((event) => {
        easyRunEventLog.push(event);
      });
    }
    return true;
  }

  // Freezing the pane's motion at a chosen time turns "pixel-match an animation"
  // into "compare two stills". Both live in the pixel-match probe, which the
  // mockup renderer evaluates too — one implementation, two surfaces.
  function easyButtonPinAnimations(timeMs) {
    return pixelMatchProbe().pin(requireEasyButtonHost(), timeMs);
  }

  function easyButtonPixelMatchMetrics() {
    return pixelMatchProbe().measure(requireEasyButtonHost(), "production");
  }

  function pixelMatchProbe() {
    const probe = globalThis.__settaEasyButtonPixelMatch;
    if (!probe) {
      throw new Error("easy-button pixel-match probe is not installed");
    }
    return probe;
  }

  function requireEasyButtonHost() {
    const host = easyButtonHost();
    if (!(host instanceof HTMLElement)) {
      throw new Error("easy-button pane host is not mounted");
    }
    return host;
  }

  async function easyButtonPaneState() {
    const context = easyButtonContext();
    const { host, stageRect, workspaceId } = context;
    if (!(host instanceof HTMLElement)) {
      return { exists: false, stageRect: rectSnapshot(stageRect), workspaceId };
    }
    const [columnRecord, snapshot] = await Promise.all([
      easyButtonColumnRecord(workspaceId),
      easyButtonSnapshot(workspaceId),
    ]);
    return easyButtonHostState(context, columnRecord, snapshot);
  }

  function easyButtonHostState({ host, stageRect, workspaceId }, columnRecord, snapshot) {
    const hostRect = host.getBoundingClientRect();
    return {
      ...easyButtonState(host),
      ...easyButtonSurfaceState(host),
      ...easyButtonHostDatasetState(host),
      exists: true,
      artifacts: easyButtonArtifacts(host),
      highlights: easyButtonHighlights(host),
      currentFocus: snapshot?.latestRun?.currentFocus ?? null,
      layoutWidthSpec: columnRecord?.widthSpec ?? null,
      railLabels: easyButtonRailLabels(host),
      railText: easyButtonRailText(host),
      rect: rectSnapshot(hostRect),
      runRequestText: snapshot?.latestRun?.requestText ?? "",
      stageRect: rectSnapshot(stageRect),
      widthRatio: easyButtonWidthRatio(hostRect, stageRect),
      workspaceId,
    };
  }

  function easyButtonSurfaceState(host) {
    const surface = host.querySelector('[data-testid="easy-button-surface"]');
    return {
      easyState: surface instanceof HTMLElement ? (surface.dataset.easyButtonState ?? "") : "",
      statusTone: elementDatasetValue(surface, "easyButtonStatus"),
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
    const surface = host.querySelector('[data-testid="easy-button-surface"]');
    const button = host.querySelector(".easy-button-control");
    const input = host.querySelector('[data-testid="easy-button-input"]');
    const inputWrap = host.querySelector(".easy-button-input-wrap");
    const enterChip = host.querySelector(".easy-button-enter-chip");
    const currentFocus = host.querySelector('[data-testid="easy-button-current-focus"]');
    const focusBlock = host.querySelector(".easy-button-focus-block");
    const focusLabel = host.querySelector('[data-testid="easy-button-focus-label"]');
    const helper = host.querySelector('[data-testid="easy-button-helper"]');
    const error = host.querySelector('[data-testid="easy-button-error"]');
    const summary = host.querySelector('[data-testid="easy-button-summary"]');
    const agentChip = host.querySelector('[data-testid="easy-button-agent-chip"]');
    const narratorStatus = host.querySelector(".easy-button-narrator-status");
    const stopButton = host.querySelector('[data-testid="easy-button-stop-button"]');
    const center = host.querySelector(".easy-button-center");
    const caption = host.querySelector(".easy-button-caption-slot");
    const buttonRect = elementRectOrZero(button);
    return {
      agentChipText: elementText(agentChip),
      buttonAriaLabel: buttonAriaLabel(button),
      buttonAnimationName: buttonPseudoStyleValue(button, "animationName"),
      buttonAnimationPlayState: buttonPseudoStyleValue(button, "animationPlayState"),
      buttonBorderColor: elementStyleValue(button, "borderTopColor"),
      buttonRect: rectSnapshot(buttonRect),
      buttonTransitionDuration: elementStyleValue(button, "transitionDuration"),
      buttonVisible: buttonVisible(buttonRect),
      captionRect: rectSnapshot(elementRectOrZero(caption)),
      centerRect: rectSnapshot(elementRectOrZero(center)),
      confirmActive: elementDatasetValue(button, "easyButtonConfirm"),
      controlAnimationName: elementStyleValue(button, "animationName"),
      currentFocusMetrics: textBoxMetrics(currentFocus),
      currentFocusRect: rectSnapshot(elementRectOrZero(currentFocus)),
      currentFocusText: elementText(currentFocus),
      enterChipText: elementText(enterChip),
      errorText: elementText(error),
      focusBlockDisplay: elementStyleValue(focusBlock, "display"),
      focusLabelText: elementText(focusLabel),
      focusStatus: elementDatasetValue(surface, "easyButtonFocus"),
      helperText: elementText(helper),
      inputFocused: input instanceof HTMLInputElement && document.activeElement === input,
      inputDisabled: inputDisabled(input),
      inputRect: rectSnapshot(elementRectOrZero(input)),
      inputTransitionDuration: elementStyleValue(input, "transitionDuration"),
      inputValue: inputValue(input),
      inputWrapTransitionDuration: elementStyleValue(inputWrap, "transitionDuration"),
      narratorStatusText: elementText(narratorStatus),
      reducedMotionMatches: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      stopButtonAriaLabel: buttonAriaLabel(stopButton),
      stopButtonDisabled: buttonDisabled(stopButton),
      stopButtonRect: rectSnapshot(elementRectOrZero(stopButton)),
      stopButtonText: elementText(stopButton),
      stopButtonTransitionDuration: elementStyleValue(stopButton, "transitionDuration"),
      stopButtonVisible: stopButton instanceof HTMLButtonElement,
      summaryText: elementText(summary),
      summaryTextMetrics: textBoxMetrics(summary),
      summaryTextRect: rectSnapshot(elementRectOrZero(summary)),
      swirl: easyButtonSwirl(host),
      toneColors: {
        completed: resolveTokenColor(surface, "--accent-green"),
        failed: resolveTokenColor(surface, "--destructive"),
        resting: resolveTokenColor(surface, "--easy-button-faint"),
      },
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

  function elementStyleValue(element, property) {
    if (!(element instanceof Element)) {
      return "";
    }
    return getComputedStyle(element)[property] ?? "";
  }

  function elementDatasetValue(element, key) {
    if (!(element instanceof HTMLElement)) {
      return "";
    }
    return element.dataset[key] ?? "";
  }

  // Resolve a design token to the exact string `getComputedStyle` will report for
  // an element painted with it, so tone assertions can name the token instead of
  // hardcoding a serialized color that shifts with Chromium's color plumbing.
  function resolveTokenColor(surface, token) {
    if (!(surface instanceof HTMLElement)) {
      return "";
    }
    const probe = document.createElement("span");
    probe.style.display = "none";
    probe.style.backgroundColor = `var(${token})`;
    surface.appendChild(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
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

  function textBoxMetrics(element) {
    if (!(element instanceof HTMLElement)) {
      return {
        clientHeight: 0,
        clientWidth: 0,
        exists: false,
        lineHeightPx: 0,
        overflowWrap: "",
        scrollHeight: 0,
        scrollWidth: 0,
        webkitLineClamp: "",
      };
    }
    const style = getComputedStyle(element);
    const lineHeight = Number.parseFloat(style.lineHeight);
    return {
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      exists: true,
      lineHeightPx: Number.isFinite(lineHeight) ? lineHeight : 0,
      overflowWrap: style.overflowWrap,
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
      webkitLineClamp: style.webkitLineClamp || style.getPropertyValue("-webkit-line-clamp") || "",
    };
  }

  // Rail labels are always rendered (they fade in with their content), so rail
  // text means the rail's *content* — otherwise every empty rail reads as "Now".
  function easyButtonRailText(host) {
    return Array.from(host.querySelectorAll(".easy-button-rail"))
      .map((rail) =>
        Array.from(rail.children)
          .filter((child) => !child.classList.contains("easy-button-rail-label"))
          .map((child) => child.textContent ?? "")
          .join(""),
      )
      .join("")
      .trim();
  }

  function easyButtonRailLabels(host) {
    return Array.from(host.querySelectorAll(".easy-button-rail-label")).map((label) => ({
      opacity: elementStyleValue(label, "opacity"),
      text: elementText(label),
    }));
  }

  function easyButtonArtifacts(host) {
    return Array.from(host.querySelectorAll(".easy-button-artifact-card")).map((card) => ({
      animationDuration: elementStyleValue(card, "animationDuration"),
      animationFillMode: elementStyleValue(card, "animationFillMode"),
      animationName: elementStyleValue(card, "animationName"),
      animationTimingFunction: elementStyleValue(card, "animationTimingFunction"),
      // The inline width, because that is what `barWidthStyle` computes. The
      // resolved px would report the flex-shrunk box instead.
      barWidths: Array.from(card.querySelectorAll(".easy-button-artifact-bar")).map((bar) =>
        bar instanceof HTMLElement ? bar.style.width : "",
      ),
      filePath: elementText(card.querySelector(".easy-button-artifact-file code")),
      kind: card instanceof HTMLElement ? (card.dataset.artifactKind ?? "") : "",
      text: (card.textContent ?? "").trim(),
      title: elementText(card.querySelector(".easy-button-artifact-title")),
      transitionDuration: elementStyleValue(card, "transitionDuration"),
    }));
  }

  function easyButtonHighlights(host) {
    return Array.from(host.querySelectorAll(".easy-button-highlight-item")).map((item) => ({
      animationFillMode: elementStyleValue(item, "animationFillMode"),
      animationName: elementStyleValue(item, "animationName"),
      dotAnimationName: elementStyleValue(
        item.querySelector(".easy-button-highlight-dot"),
        "animationName",
      ),
      dotBackgroundColor: elementStyleValue(
        item.querySelector(".easy-button-highlight-dot"),
        "backgroundColor",
      ),
      opacity: elementStyleValue(item, "opacity"),
      text: elementText(item.querySelector(".easy-button-highlight-text")),
      time: elementText(item.querySelector(".easy-button-highlight-time")),
      transitionDuration: elementStyleValue(item, "transitionDuration"),
    }));
  }

  // Every parameter of the swirl's motion except the current time is static and
  // inspectable — keyframe names, durations, play state, blend mode, the filter
  // stack, the mask, and the mapping from pane state to opacity. Those are what
  // the pixel-match gate asserts; per-frame equality is neither achievable nor
  // meaningful.
  function easyButtonSwirl(host) {
    const swirl = host.querySelector(".easy-button-swirl");
    const inner = host.querySelector(".easy-button-swirl-inner");
    const core = host.querySelector(".easy-button-swirl-core");
    return {
      // `backgroundImage` is not decoration in this probe. The arms are built
      // from relative colors, `rgb(from var(--token) r g b / a)`; if that ever
      // fails to parse, the whole gradient declaration is dropped, the layer
      // paints nothing, and every other parameter here still reports correctly.
      coreBackgroundImage: elementStyleValue(core, "backgroundImage"),
      exists: swirl instanceof HTMLElement,
      filter: elementStyleValue(swirl, "filter"),
      inner: {
        animationDuration: elementStyleValue(inner, "animationDuration"),
        animationName: elementStyleValue(inner, "animationName"),
        animationPlayState: elementStyleValue(inner, "animationPlayState"),
      },
      layers: Array.from(host.querySelectorAll(".easy-button-swirl-layer")).map((layer) => ({
        animationDuration: elementStyleValue(layer, "animationDuration"),
        animationName: elementStyleValue(layer, "animationName"),
        animationPlayState: elementStyleValue(layer, "animationPlayState"),
        backgroundImage: elementStyleValue(layer, "backgroundImage"),
        mixBlendMode: elementStyleValue(layer, "mixBlendMode"),
        opacity: elementStyleValue(layer, "opacity"),
        willChange: elementStyleValue(layer, "willChange"),
      })),
      maskImage: elementStyleValue(swirl, "maskImage"),
      opacity: elementStyleValue(swirl, "opacity"),
      transitionDuration: elementStyleValue(swirl, "transitionDuration"),
    };
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

  async function easyButtonSnapshot(workspaceId) {
    if (!workspaceId || workspaceId === "empty") {
      return null;
    }
    return window.setta.easyRun.snapshot(workspaceId);
  }

  async function easyButtonPaneChatRecord() {
    const workspaceId = currentWorkspaceId();
    const snapshot = await easyButtonSnapshot(workspaceId);
    const run = snapshot?.latestRun;
    if (!run) {
      return null;
    }
    return window.setta.chat.messagePage(workspaceId, run.conversationId, 0, 100);
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
