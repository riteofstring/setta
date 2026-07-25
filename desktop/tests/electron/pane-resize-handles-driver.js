/* global HTMLElement, document */

(() => {
  const version = "setta-pane-resize-handles-driver-v1";

  function installPaneResizeHandlesDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      paneResizeHandlesSnapshot,
      paneResizeHandlesVersion: version,
    });
  }

  function paneResizeHandlesSnapshot() {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const stage = document.querySelector('[data-testid="workspace-presentation-engine"]');
    const visibleHosts = workspaceVisibleHosts();
    const workspacePaneIds = new Set(visibleHosts.map((host) => host.paneId));
    return {
      handles: workspaceResizeHandles(workspacePaneIds),
      mode: area instanceof HTMLElement ? (area.dataset.presentationMode ?? "") : "",
      stage: stage instanceof HTMLElement ? rectFor(stage) : null,
      visibleHosts,
      workspaceId: area instanceof HTMLElement ? (area.dataset.workspaceId ?? "") : "",
    };
  }

  function workspaceVisibleHosts() {
    return Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]'))
      .filter(
        (host) =>
          host instanceof HTMLElement &&
          host.dataset.visible === "true" &&
          host.dataset.surfaceKind !== "master",
      )
      .map((host) => ({
        focused: host.dataset.focused === "true",
        paneId: host.dataset.paneId ?? "",
        rect: rectFor(host),
      }));
  }

  function workspaceResizeHandles(workspacePaneIds) {
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
        const center = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
        const hit = document.elementFromPoint(center.x, center.y);
        return {
          adjacentPaneId: handle.dataset.adjacentPaneId ?? "",
          axis: handle.dataset.workspacePaneResizeAxis ?? "",
          center,
          hit:
            hit instanceof HTMLElement
              ? {
                  axis: hit.dataset.workspacePaneResizeAxis ?? "",
                  className: hit.className,
                  paneId: hit.dataset.paneId ?? "",
                  tagName: hit.tagName,
                }
              : null,
          paneId: handle.dataset.paneId ?? "",
          rect,
        };
      });
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

  installPaneResizeHandlesDriver();
})();
