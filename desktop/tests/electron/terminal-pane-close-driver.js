/* global HTMLButtonElement, HTMLElement, document, window */

(() => {
  const version = "setta-terminal-pane-close-driver-v1";

  function installTerminalPaneCloseDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      closeTerminalPane,
      terminalPaneCloseVersion: version,
      terminalSessionState,
    });
  }

  function closeTerminalPane() {
    const host = activeTerminalHost();
    const button = host?.querySelector('[data-workspace-pane-action="close"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-close-button" };
    }
    if (button.disabled) {
      return { ok: false, reason: "disabled-close-button" };
    }
    button.click();
    return { ok: true };
  }

  function terminalSessionState({ sessionId }) {
    const matches = terminalHosts().filter((host) => host.dataset.terminalSessionId === sessionId);
    return {
      exists: matches.length > 0,
      visible: matches.some((host) => terminalHostIntersectsViewport(host)),
    };
  }

  function activeTerminalHost() {
    const hosts = terminalHosts();
    return (
      hosts.find((host) => host.dataset.focused === "true") ??
      hosts.find((host) => terminalHostIntersectsViewport(host)) ??
      hosts[0] ??
      null
    );
  }

  function terminalHosts() {
    return Array.from(
      document.querySelectorAll(
        '[data-testid="workspace-pane-host"][data-surface-kind="terminal"]',
      ),
    ).filter((host) => host instanceof HTMLElement);
  }

  function terminalHostIntersectsViewport(host) {
    return host.dataset.visible === "true" && elementIntersectsViewport(host);
  }

  function elementIntersectsViewport(candidate) {
    const rect = candidate.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.top < window.innerHeight
    );
  }

  installTerminalPaneCloseDriver();
})();
