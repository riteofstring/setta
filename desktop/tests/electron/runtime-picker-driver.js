/* global HTMLElement, document */

(() => {
  const version = "setta-runtime-picker-driver-v1";

  function installRuntimePickerDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      runtimePickerVersion: version,
      runtimePickerWorkspacePaneSnapshot,
    });
  }

  function runtimePickerWorkspacePaneSnapshot() {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const hosts = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]'))
      .filter((host) => host instanceof HTMLElement && host.dataset.visible === "true")
      .map((host) => ({
        paneId: host.dataset.paneId ?? "",
        surfaceKind: host.dataset.surfaceKind ?? "",
      }))
      .toSorted((left, right) => left.paneId.localeCompare(right.paneId));
    return {
      paneCount: Number(area instanceof HTMLElement ? (area.dataset.paneCount ?? "0") : "0"),
      paneIds: hosts.map((host) => host.paneId),
      panes: hosts,
      surfaceKinds: hosts.map((host) => host.surfaceKind),
      workspaceId: area instanceof HTMLElement ? (area.dataset.workspaceId ?? "") : "",
    };
  }

  installRuntimePickerDriver();
})();
