/* global HTMLElement, document, getComputedStyle, window */

(() => {
  const version = "setta-workspace-ultrawide-live-panes-driver-v1";
  const paneHostSelector = '[data-testid="workspace-pane-host"]';
  const workspaceLayoutSelector = '[data-testid="workspace-layout-area"]';
  const presentationEngineSelector = '[data-testid="workspace-presentation-engine"]';

  function installWorkspaceUltrawideLivePanesDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      workspaceUltrawideLivePanesVersion: version,
      workspaceUltrawidePaneSnapshot,
      workspaceUltrawideSaveUILayout,
      workspaceUltrawideWorkspaceId,
    });
  }

  function workspaceUltrawideWorkspaceId() {
    const area = document.querySelector(workspaceLayoutSelector);
    return area instanceof HTMLElement ? (area.dataset.workspaceId ?? "") : "";
  }

  async function workspaceUltrawideSaveUILayout({ layout }) {
    await window.setta.appLayout.savePaneLayout(layout);
    const readback = await window.setta.appLayout.readPaneLayout();
    return {
      ok: readback.layout?.panes?.length === layout.panes.length,
      readbackPaneCount: readback.layout?.panes?.length ?? 0,
    };
  }

  function workspaceUltrawidePaneSnapshot() {
    const area = workspaceLayoutArea();
    const stageRect = presentationStageRect();
    const hosts = visiblePaneHosts();
    const workspacePaneIds = new Set(hosts.map((host) => host.paneId));
    return {
      focusedPaneId: focusedPaneId(hosts),
      intersectingHosts: intersectingHosts(hosts, stageRect),
      mode: datasetValue(area, "presentationMode"),
      resizeHandles: paneResizeHandles(workspacePaneIds),
      runtimeStates: hostRuntimeStates(hosts),
      stageRect,
      totalPanes: hosts.length,
      visibleHosts: hosts,
      workspaceId: workspaceUltrawideWorkspaceId(),
      workspaceMode: datasetValue(area, "workspaceMode"),
    };
  }

  function workspaceLayoutArea() {
    const area = document.querySelector(workspaceLayoutSelector);
    return area instanceof HTMLElement ? area : null;
  }

  function presentationStageRect() {
    const stage = document.querySelector(presentationEngineSelector);
    return stage instanceof HTMLElement ? rectFor(stage) : emptyRect();
  }

  function focusedPaneId(hosts) {
    return hosts.find((host) => host.focused)?.paneId ?? "";
  }

  function intersectingHosts(hosts, stageRect) {
    return hosts.filter((host) => rectsIntersect(host.rect, stageRect));
  }

  function datasetValue(element, key) {
    return element?.dataset[key] ?? "";
  }

  function visiblePaneHosts() {
    return Array.from(document.querySelectorAll(paneHostSelector))
      .filter(
        (host) =>
          host instanceof HTMLElement &&
          host.dataset.visible === "true" &&
          host.dataset.surfaceKind !== "master",
      )
      .map(paneHostSnapshot);
  }

  function paneHostSnapshot(host) {
    const rect = rectFor(host);
    const style = getComputedStyle(host);
    return {
      focused: host.dataset.focused === "true",
      paneId: host.dataset.paneId ?? "",
      pointerEvents: style.pointerEvents,
      rect,
      runtimeState: host.dataset.runtimeState ?? "",
      surfaceId: host.dataset.surfaceId ?? "",
      surfaceKind: host.dataset.surfaceKind ?? "",
    };
  }

  function paneResizeHandles(workspacePaneIds) {
    return Array.from(document.querySelectorAll(".workspace-pane-resize-handle"))
      .filter(
        (handle) =>
          handle instanceof HTMLElement &&
          workspacePaneIds.has(handle.dataset.paneId ?? "") &&
          (handle.dataset.adjacentPaneId === "" ||
            workspacePaneIds.has(handle.dataset.adjacentPaneId ?? "")),
      )
      .map((handle) => {
        const rect = rectFor(handle);
        return {
          adjacentPaneId: handle.dataset.adjacentPaneId ?? "",
          axis: handle.dataset.workspacePaneResizeAxis ?? "",
          center: {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          },
          paneId: handle.dataset.paneId ?? "",
          rect,
        };
      });
  }

  function hostRuntimeStates(hosts) {
    return hosts.reduce((states, host) => {
      states[host.runtimeState] = (states[host.runtimeState] ?? 0) + 1;
      return states;
    }, {});
  }

  function rectsIntersect(left, right) {
    return (
      left.left < right.right &&
      left.right > right.left &&
      left.top < right.bottom &&
      left.bottom > right.top
    );
  }

  function rectFor(element) {
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

  function emptyRect() {
    return { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 };
  }

  installWorkspaceUltrawideLivePanesDriver();
})();
