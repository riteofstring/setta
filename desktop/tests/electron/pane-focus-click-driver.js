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
      paneFocusClickVersion: version,
      paneFocusWorkflowState,
      workspaceUILayoutResetState,
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

  function workspaceUILayoutResetState() {
    const roots = workspaceRoots();
    if (!roots.ok) {
      return roots;
    }
    const layoutResult = readLayoutState();
    if (!layoutResult.ok) {
      return layoutResult;
    }
    return {
      focusedPaneId: layoutResult.snapshot.focusedPaneId,
      ok: true,
      paneCount: Number(roots.area.dataset.paneCount ?? "0"),
      revision: layoutResult.snapshot.revision,
      surfaceKinds: Array.from(document.querySelectorAll(paneHostSelector))
        .filter((host) => host instanceof HTMLElement)
        .map((host) => host.dataset.surfaceKind ?? ""),
      workspaceId: roots.area.dataset.workspaceId ?? "",
    };
  }

  function visiblePaneSummaries(stageRect) {
    return visiblePaneHosts().map((host) => paneSummary(host, stageRect));
  }

  function visiblePaneHosts() {
    return Array.from(document.querySelectorAll(visiblePaneHostSelector)).filter(
      (host) => host instanceof HTMLElement,
    );
  }

  function paneSummary(host, stageRect) {
    const rect = elementRect(host);
    const topBar = host.querySelector(".workspace-pane-top-bar");
    return {
      closeClickable: closeButtonClickable(host),
      focused: host.dataset.focused === "true",
      hasTopBar: topBar instanceof HTMLElement,
      paneId: host.dataset.paneId ?? "",
      rect,
      stageContained: rectInsideRect(rect, stageRect),
      surfaceKind: host.dataset.surfaceKind ?? "",
      terminalReady: Boolean(host.querySelector(".xterm-helper-textarea")),
      topBarClickable: topBar instanceof HTMLElement && elementIntersectsViewport(topBar),
      visible: host.dataset.visible === "true",
    };
  }

  function closeButtonClickable(host) {
    const closeButton = host.querySelector('[data-workspace-pane-action="close"]');
    return closeButton instanceof HTMLButtonElement && !closeButton.disabled;
  }

  function paneFocusScenarioFromPanes(panes) {
    for (const terminal of terminalPaneCandidates(panes)) {
      const focusAway = focusAwayPaneForTerminal(panes, terminal);
      if (focusAway) {
        return paneFocusScenario(panes, terminal, focusAway);
      }
    }
    return { ok: false, reason: "missing-contained-terminal-and-clickable-focus-away-pane" };
  }

  function terminalPaneCandidates(panes) {
    return panes.filter(terminalPaneReady).toSorted(sortFocusedFirst);
  }

  function terminalPaneReady(pane) {
    return (
      pane.surfaceKind === "terminal" && pane.stageContained && pane.terminalReady && pane.hasTopBar
    );
  }

  function sortFocusedFirst(left, right) {
    return Number(right.focused) - Number(left.focused);
  }

  function focusAwayPaneForTerminal(panes, terminal) {
    return panes
      .filter((pane) => focusAwayPaneReady(pane, terminal))
      .toSorted(sortNearTerminal(terminal))
      .at(0);
  }

  function focusAwayPaneReady(pane, terminal) {
    return (
      pane.paneId !== terminal.paneId &&
      pane.surfaceKind !== "terminal" &&
      pane.topBarClickable &&
      rectsVerticallyOverlap(pane, terminal)
    );
  }

  function sortNearTerminal(terminal) {
    return (left, right) =>
      Number(right.stageContained) - Number(left.stageContained) ||
      Math.abs(rectCenterX(left) - rectCenterX(terminal)) -
        Math.abs(rectCenterX(right) - rectCenterX(terminal));
  }

  function paneFocusScenario(panes, terminal, focusAway) {
    return {
      focusAwayPaneId: focusAway.paneId,
      minimal: panes.length === 2 && terminal.stageContained && focusAway.stageContained,
      ok: true,
      terminalPaneId: terminal.paneId,
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
    if (host.dataset.surfaceKind !== "terminal") {
      return host;
    }
    return host.querySelector(".workspace-xterm-viewport") ?? host.querySelector(".xterm-screen");
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
