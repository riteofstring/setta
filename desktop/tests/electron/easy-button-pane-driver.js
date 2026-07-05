/* global HTMLButtonElement, HTMLElement, document, getComputedStyle, window */

(() => {
  const version = "setta-easy-button-pane-driver-v1";

  function installEasyButtonPaneDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      clickEasyButtonMenuAction,
      closeEasyButtonPane,
      easyButtonMenuActionState,
      easyButtonPaneState,
      easyButtonPaneVersion: version,
      readPersistedEasyButtonLayout,
    });
  }

  function easyButtonPaneState() {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const stage = document.querySelector('[data-testid="workspace-presentation-engine"]');
    const hosts = easyButtonHosts();
    return {
      areaRect: rectForElement(area),
      count: hosts.length,
      hosts: hosts.map(easyButtonHostState),
      layoutViewport: layoutViewportForStage(stage, area),
      nativeViewClipLeft: workspaceAreaNumberDataset(area, "nativeViewClipLeft"),
      paneCount: Number(workspaceAreaDataset(area, "paneCount")),
      presentationMode: workspaceAreaDataset(area, "presentationMode"),
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      stageRect: rectForElement(stage),
      surfaceCount: document.querySelectorAll('[data-testid="easy-button-surface"]').length,
      workspaceId: workspaceAreaDataset(area, "workspaceId"),
    };
  }

  function easyButtonHostState(host) {
    const glowStyle = easyButtonGlowStyle(host);
    return {
      chromeIconViewBox: attributeForSelector(host, ".workspace-pane-title-icon", "viewBox"),
      focused: datasetValue(host, "focused"),
      glowAnimationName: styleValue(glowStyle, "animationName"),
      glowAnimationPlayState: styleValue(glowStyle, "animationPlayState"),
      hasFooterInput: hasEasyButtonFooterInput(host),
      hasMicGlyph: hasEasyButtonMicGlyph(host),
      helperText: textForSelector(host, ".easy-button-helper"),
      paneId: datasetValue(host, "paneId"),
      railLabelsVisible: visibleEasyButtonRailLabelCount(host),
      rect: elementRect(host),
      runtimeState: datasetValue(host, "runtimeState"),
      surfaceFrozen: datasetValue(host, "surfaceFrozen"),
      surfaceVisible: datasetValue(host, "surfaceVisible"),
      title: textForSelector(host, ".workspace-pane-title"),
      visible: datasetValue(host, "visible"),
    };
  }

  function easyButtonHosts() {
    return Array.from(
      document.querySelectorAll(
        '[data-testid="workspace-pane-host"][data-surface-kind="easy-button"]',
      ),
    ).filter((host) => host instanceof HTMLElement);
  }

  function easyButtonGlowStyle(host) {
    const idleButton = host.querySelector('[data-testid="easy-button-idle-button"]');
    if (!(idleButton instanceof HTMLElement)) {
      return null;
    }
    return getComputedStyle(idleButton, "::after");
  }

  function hasEasyButtonFooterInput(host) {
    const surface = host.querySelector('[data-testid="easy-button-surface"]');
    return Boolean(surface?.querySelector("input, textarea"));
  }

  function hasEasyButtonMicGlyph(host) {
    const surface = host.querySelector('[data-testid="easy-button-surface"]');
    return Boolean(surface?.querySelector(".glyph-mic"));
  }

  function visibleEasyButtonRailLabelCount(host) {
    return Array.from(host.querySelectorAll(".easy-button-rail-label")).filter(
      (label) => getComputedStyle(label).opacity !== "0",
    ).length;
  }

  function easyButtonMenuActionState() {
    const item = easyButtonMenuItem();
    return {
      disabled: item instanceof HTMLButtonElement ? item.disabled : false,
      present: item instanceof HTMLButtonElement,
      text: item instanceof HTMLElement ? item.innerText.trim() : "",
    };
  }

  function clickEasyButtonMenuAction() {
    const item = easyButtonMenuItem();
    if (!(item instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-menuitem" };
    }
    if (item.disabled) {
      return { ok: false, reason: "disabled-menuitem" };
    }
    item.click();
    return { ok: true };
  }

  function easyButtonMenuItem() {
    return (
      Array.from(document.querySelectorAll('button[role="menuitem"]')).find(
        (candidate) =>
          candidate instanceof HTMLButtonElement && candidate.textContent?.includes("Easy Button"),
      ) ?? null
    );
  }

  function closeEasyButtonPane() {
    const host = easyButtonHosts()[0] ?? null;
    const button = host?.querySelector('button[aria-label="Close pane"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, reason: "missing-close-button" };
    }
    button.click();
    return { ok: true };
  }

  async function readPersistedEasyButtonLayout({ workspaceId }) {
    const result = await window.setta.workspace.readUILayout(workspaceId);
    const layout = result.layout;
    const panes = persistedEasyButtonPanes(layout);
    const pane = panes.length > 0 ? panes[0] : null;
    return {
      column: persistedEasyButtonColumn(layout, pane),
      count: panes.length,
      pane,
      workspaceId: result.workspaceId,
    };
  }

  function persistedEasyButtonPanes(layout) {
    if (!layout) {
      return [];
    }
    return layout.panes.filter((pane) => pane.surfaceKind === "easy-button");
  }

  function persistedEasyButtonColumn(layout, pane) {
    if (!layout || !pane) {
      return null;
    }
    return layout.columns.find((candidate) => candidate.paneIds.includes(pane.paneId)) ?? null;
  }

  function workspaceAreaDataset(area, key) {
    if (!(area instanceof HTMLElement)) {
      return "";
    }
    return datasetValue(area, key);
  }

  function workspaceAreaNumberDataset(area, key) {
    const value = Number(workspaceAreaDataset(area, key));
    return Number.isFinite(value) ? value : 0;
  }

  function layoutViewportForStage(stage, area) {
    const stageRect = rectForElement(stage);
    const reservedLeftWidth = workspaceAreaNumberDataset(area, "nativeViewClipLeft");
    const reservedWidth = Math.max(0, Math.min(stageRect.width - 1, reservedLeftWidth));
    return {
      height: stageRect.height,
      width: stageRect.width - reservedWidth,
      x: reservedWidth,
      y: 0,
    };
  }

  function datasetValue(element, key) {
    return element.dataset[key] ?? "";
  }

  function styleValue(style, key) {
    if (!style) {
      return "";
    }
    return style[key] ?? "";
  }

  function textForSelector(root, selector) {
    return root.querySelector(selector)?.textContent?.trim() ?? "";
  }

  function attributeForSelector(root, selector, attribute) {
    return root.querySelector(selector)?.getAttribute(attribute) ?? "";
  }

  function rectForElement(element) {
    if (!(element instanceof HTMLElement)) {
      return emptyRect();
    }
    return elementRect(element);
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
      x: rect.x,
      y: rect.y,
    };
  }

  function emptyRect() {
    return {
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
    };
  }

  installEasyButtonPaneDriver();
})();
