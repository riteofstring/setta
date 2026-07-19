/* global HTMLButtonElement, HTMLElement, document, window */

(() => {
  const version = "setta-app-pane-layout-driver-v1";
  let roundTripPromise = null;

  function installAppPaneLayoutDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      appPaneLayoutClickFocusedMaximize,
      appPaneLayoutRoundTrip,
      appPaneLayoutShellState,
      appPaneLayoutVersion: version,
    });
  }

  function appPaneLayoutRoundTrip() {
    roundTripPromise ??= runAppPaneLayoutRoundTrip();
    return roundTripPromise;
  }

  function appPaneLayoutShellState() {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const hosts = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]'))
      .filter((host) => host instanceof HTMLElement && host.dataset.paneId)
      .map((host) => ({
        focused: host.dataset.focused ?? "",
        maximized: host.dataset.maximized ?? "",
        paneId: host.dataset.paneId ?? "",
        surfaceKind: host.dataset.surfaceKind ?? "",
        visible: host.dataset.visible ?? "",
      }));
    return {
      hosts,
      maximizedPaneId: area instanceof HTMLElement ? (area.dataset.maximizedPaneId ?? "") : "",
      paneCount: area instanceof HTMLElement ? (area.dataset.paneCount ?? "") : "",
      ready: area instanceof HTMLElement,
      workspaceId: area instanceof HTMLElement ? (area.dataset.workspaceId ?? "") : "",
    };
  }

  function appPaneLayoutClickFocusedMaximize() {
    const focusedHost = document.querySelector(
      '[data-testid="workspace-pane-host"][data-focused="true"]',
    );
    const button =
      focusedHost instanceof HTMLElement
        ? focusedHost.querySelector('[data-workspace-pane-action="maximize"]')
        : null;
    if (!(button instanceof HTMLButtonElement)) {
      return { clicked: false, reason: "missing-maximize-button" };
    }
    if (button.disabled) {
      return { clicked: false, reason: "disabled-maximize-button" };
    }
    button.click();
    return { clicked: true, reason: "clicked" };
  }

  async function runAppPaneLayoutRoundTrip() {
    const api = appLayoutAPI();
    if (api.status === "failed") {
      return api;
    }
    const initial = await api.readPaneLayout();
    const initialFailure = appPaneLayoutInitialFailure(initial);
    if (initialFailure) {
      return initialFailure;
    }
    const layout = appPaneLayout();
    const saved = await api.savePaneLayout(layout);
    const readBack = await api.readPaneLayout();
    return appPaneLayoutRoundTripResult(layout, saved, readBack);
  }

  function appLayoutAPI() {
    const api = window.setta?.appLayout;
    if (!api) {
      return { reason: "missing-app-layout-api", status: "failed" };
    }
    return api;
  }

  function appPaneLayoutInitialFailure(initial) {
    if (initial.layout === null) {
      return null;
    }
    return { initial, reason: "unexpected-initial-layout", status: "failed" };
  }

  function appPaneLayoutRoundTripResult(layout, saved, readBack) {
    if (saved.focusedPaneId !== layout.focusedPaneId) {
      return { reason: "saved-focus-mismatch", saved, status: "failed" };
    }
    return appPaneLayoutReadBackResult(layout, readBack);
  }

  function appPaneLayoutReadBackResult(layout, readBack) {
    if (readBack.layout?.focusedPaneId !== layout.focusedPaneId) {
      return { readBack, reason: "read-focus-mismatch", status: "failed" };
    }
    if (readBack.layout?.panes?.[1]?.surfaceKind !== "conversation") {
      return { readBack, reason: "conversation-pane-missing", status: "failed" };
    }
    return { readBack, status: "passed" };
  }

  function appPaneLayout() {
    return {
      columns: [
        {
          columnId: "app_column_0",
          idealWidthSpec: { unit: "px", value: 640 },
          index: 0,
          paneIds: ["app_pane_master", "app_pane_conversation"],
          planeIndex: 0,
          previousProportionWidth: null,
          slotIndex: 0,
          widthSpec: { unit: "px", value: 720 },
        },
      ],
      focusedPaneId: "app_pane_master",
      maximizedPaneId: "app_pane_master",
      panes: [
        {
          columnId: "app_column_0",
          conversationConfig: null,
          heat: 0,
          masterConfig: {},
          paneId: "app_pane_master",
          sequence: 0,
          subtitle: "Global coordinator",
          surfaceId: "app_surface_master",
          surfaceKind: "master",
          title: "Setta",
          tone: "slate",
          weight: 1.6,
        },
        {
          columnId: "app_column_0",
          conversationConfig: {
            conversationId: "conversation_workflow",
            presentationIdentity: {
              subtitle: "Topic conversation",
              title: "Workflow topic",
              tone: "cyan",
            },
            resourceBindings: [],
          },
          heat: 37,
          masterConfig: null,
          paneId: "app_pane_conversation",
          sequence: 1,
          subtitle: "Topic conversation",
          surfaceId: "app_surface_conversation",
          surfaceKind: "conversation",
          title: "Workflow topic",
          tone: "cyan",
          weight: 1,
        },
      ],
      schemaVersion: 1,
    };
  }

  installAppPaneLayoutDriver();
})();
