/* global HTMLButtonElement, HTMLElement, document, window */

(() => {
  const version = "setta-pane-focus-click-driver-v1";
  const paneHostSelector = '[data-testid="workspace-pane-host"]';
  const visiblePaneHostSelector = `${paneHostSelector}[data-visible="true"]`;

  function installPaneFocusClickDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      paneClickPoint,
      paneFocusCloseFirstEasyButtonPane,
      paneFocusClickVersion: version,
      paneFocusWorkflowState,
    });
  }

  function paneFocusWorkflowState() {
    const roots = workspaceRoots();
    if (!roots.ok) {
      return roots;
    }
    const layoutResult = readLayoutState();
    if (!layoutResult.ok) {
      return layoutResult;
    }
    const stageRect = elementRect(roots.stage);
    const panes = visiblePaneSummaries(stageRect);
    return {
      layout: { ...layoutResult.snapshot, workspaceId: roots.area.dataset.workspaceId ?? "" },
      ok: true,
      panes,
      scenario: paneFocusScenarioFromPanes(panes),
      stageRect,
    };
  }

  function workspaceRoots() {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const stage = document.querySelector('[data-testid="workspace-presentation-engine"]');
    if (!(area instanceof HTMLElement) || !(stage instanceof HTMLElement)) {
      return { ok: false, reason: "missing-workspace-layout" };
    }
    return { area, ok: true, stage };
  }

  function readLayoutState() {
    const read = window.__settaWorkspaceReadLayoutState;
    if (typeof read !== "function") {
      return { ok: false, reason: "layout-state-unavailable" };
    }
    return { ok: true, snapshot: read() };
  }

  function visiblePaneSummaries(stageRect) {
    return visiblePaneHosts().map((host) => paneSummary(host, stageRect));
  }

  function visiblePaneHosts() {
    return Array.from(document.querySelectorAll(visiblePaneHostSelector)).filter(
      (host) => host instanceof HTMLElement && host.dataset.surfaceKind !== "master",
    );
  }

  function paneSummary(host, stageRect) {
    const rect = elementRect(host);
    const topBar = host.querySelector(".workspace-pane-top-bar");
    const content = paneClickTarget(host, "content");
    return {
      closeClickable: closeButtonClickable(host),
      contentClickable: content instanceof HTMLElement && elementIntersectsViewport(content),
      focused: host.dataset.focused === "true",
      hasTopBar: topBar instanceof HTMLElement,
      paneId: host.dataset.paneId ?? "",
      rect,
      stageContained: rectInsideRect(rect, stageRect),
      surfaceKind: host.dataset.surfaceKind ?? "",
      topBarClickable: topBar instanceof HTMLElement && elementIntersectsViewport(topBar),
      visible: host.dataset.visible === "true",
    };
  }

  function closeButtonClickable(host) {
    const closeButton = host.querySelector('[data-workspace-pane-action="close"]');
    return closeButton instanceof HTMLButtonElement && !closeButton.disabled;
  }

  function paneFocusCloseFirstEasyButtonPane() {
    const host = visiblePaneHosts().find(
      (candidate) => candidate.dataset.surfaceKind === "conversation",
    );
    const closeButton = host?.querySelector('[data-workspace-pane-action="close"]');
    if (!(host instanceof HTMLElement) || !(closeButton instanceof HTMLButtonElement)) {
      return { clicked: false, reason: "missing-easy-button-pane" };
    }
    if (closeButton.disabled) {
      return { clicked: false, paneId: host.dataset.paneId ?? "", reason: "disabled" };
    }
    closeButton.click();
    return { clicked: true, paneId: host.dataset.paneId ?? "" };
  }

  function paneFocusScenarioFromPanes(panes) {
    for (const contentPane of contentPaneCandidates(panes)) {
      const focusAway = focusAwayPaneForContentPane(panes, contentPane);
      if (focusAway) {
        return paneFocusScenario(panes, contentPane, focusAway);
      }
    }
    return { ok: false, reason: "missing-contained-content-and-clickable-focus-away-pane" };
  }

  function contentPaneCandidates(panes) {
    return panes
      .filter(contentPaneReady)
      .toSorted((left, right) => right.rect.left - left.rect.left);
  }

  function contentPaneReady(pane) {
    return pane.stageContained && pane.contentClickable && pane.hasTopBar;
  }

  function focusAwayPaneForContentPane(panes, contentPane) {
    return panes
      .filter((pane) => focusAwayPaneReady(pane, contentPane))
      .toSorted(sortNearContentPane(contentPane))
      .at(0);
  }

  function focusAwayPaneReady(pane, contentPane) {
    return (
      pane.paneId !== contentPane.paneId &&
      pane.topBarClickable &&
      rectsVerticallyOverlap(pane, contentPane)
    );
  }

  function sortNearContentPane(contentPane) {
    return (left, right) =>
      Number(right.stageContained) - Number(left.stageContained) ||
      Math.abs(rectCenterX(left) - rectCenterX(contentPane)) -
        Math.abs(rectCenterX(right) - rectCenterX(contentPane));
  }

  function paneFocusScenario(panes, contentPane, focusAway) {
    return {
      contentPaneId: contentPane.paneId,
      focusAwayPaneId: focusAway.paneId,
      minimal: panes.length === 2 && contentPane.stageContained && focusAway.stageContained,
      ok: true,
    };
  }

  function paneClickPoint({ paneId, targetKind }) {
    const host = visiblePaneHostByPaneId(paneId);
    if (!host) {
      return { ok: false, reason: "missing-visible-pane-host" };
    }
    const target = paneClickTarget(host, targetKind);
    if (!(target instanceof HTMLElement)) {
      return missingPaneClickTarget(host, targetKind);
    }
    if (!elementIntersectsViewport(target)) {
      return paneClickTargetOutsideViewport(target, targetKind);
    }
    return paneClickPointForTarget(target, targetKind);
  }

  function visiblePaneHostByPaneId(paneId) {
    return visiblePaneHosts().find((host) => host.dataset.paneId === paneId) ?? null;
  }

  function paneClickTarget(host, targetKind) {
    if (targetKind === "top-bar") {
      return host.querySelector(".workspace-pane-top-bar");
    }
    return host.querySelector(".workspace-pane-content") ?? host;
  }

  function missingPaneClickTarget(host, targetKind) {
    return {
      ok: false,
      reason: targetKind === "top-bar" ? "missing-pane-top-bar" : "missing-pane-content",
      rect: elementRect(host),
    };
  }

  function paneClickTargetOutsideViewport(target, targetKind) {
    return {
      ok: false,
      reason:
        targetKind === "top-bar"
          ? "pane-top-bar-outside-viewport"
          : "pane-content-outside-viewport",
      rect: elementRect(target),
    };
  }

  function paneClickPointForTarget(target, targetKind) {
    const rect = target.getBoundingClientRect();
    return {
      ok: true,
      x: clamp(rect.left + rect.width / 2, 8, window.innerWidth - 8),
      y: clamp(rect.top + paneClickYOffset(rect, targetKind), 8, window.innerHeight - 8),
    };
  }

  function paneClickYOffset(rect, targetKind) {
    return targetKind === "top-bar" ? Math.min(15, rect.height / 2) : rect.height / 2;
  }

  function rectsVerticallyOverlap(left, right) {
    return (
      left.rect.height > 0 &&
      right.rect.height > 0 &&
      Math.max(left.rect.top, right.rect.top) < Math.min(left.rect.bottom, right.rect.bottom)
    );
  }

  function rectCenterX(pane) {
    return pane.rect.left + pane.rect.width / 2;
  }

  function rectInsideRect(inner, outer) {
    return (
      inner.width > 0 &&
      inner.height > 0 &&
      inner.left >= outer.left &&
      inner.right <= outer.right &&
      inner.top >= outer.top &&
      inner.bottom <= outer.bottom
    );
  }

  function elementIntersectsViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.top < window.innerHeight
    );
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

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  installPaneFocusClickDriver();
})();
