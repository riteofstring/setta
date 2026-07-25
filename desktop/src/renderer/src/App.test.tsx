import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, test } from "vitest";

import { App } from "./App";
import { useAppearanceStore } from "./stores/appearance-store";
import { useSettingsNavigationStore } from "./stores/settings-navigation-store";

beforeEach(() => {
  useAppearanceStore.setState(useAppearanceStore.getInitialState(), true);
  useSettingsNavigationStore.setState(useSettingsNavigationStore.getInitialState(), true);
});

describe("Director command-center shell", () => {
  test("renders a preload contract error when the Electron API is missing", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });

    const html = renderToString(<App />);

    expect(html).toContain('data-testid="app-runtime-contract-error"');
    expect(html).toContain("Setta preload API is unavailable.");
    expect(html).toContain("window.setta");
  });

  test("mounts the fullscreen Director shell instead of the pane workspace", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        setta: minimalSettaApi("darwin"),
      },
    });

    const html = renderToString(<App />);

    expect(html).toContain('data-testid="app-director-shell"');
    expect(html).toContain('data-testid="director-command-center-shell"');
    expect(html).toContain('data-testid="director-command-center-top-bar"');
    expect(html).toContain('data-setta-shell-title-bar="true"');
    expect(html).toContain('data-desktop-platform="darwin"');
    expect(html).toContain('aria-label="Director command center"');
    expect(html).toContain('aria-label="Director composer"');
    expect(html).toContain('aria-label="Now"');
    expect(html).toContain('aria-label="Artifacts"');
    expect(html).not.toContain('data-testid="workspace-layout-area"');
    expect(html).not.toContain("data-pane-count=");
    expect(html).not.toContain("Back to panes");
    expect(html).not.toContain('aria-label="Hide project sidebar"');
  });
});

function minimalSettaApi(platform: string) {
  return {
    app: {
      platform,
    },
    director: {
      dispatch: async () => ({ kind: "submit", selectedWorkstreamId: null, submit: null }),
      onEvent: () => () => undefined,
      readSnapshot: async () => emptyDirectorSnapshot(),
      subscribe: async () => undefined,
    },
    workspace: {
      session: async () => ({
        activeWorkspaces: [],
        recentWorkspaces: [],
        selectedWorkspaceId: "",
        workspaceAvailabilities: [],
      }),
    },
  };
}

function emptyDirectorSnapshot() {
  return {
    aggregates: {
      artifactCount: 0,
      awaitingApprovalCount: 0,
      awaitingResourceCount: 0,
      blockedCount: 0,
      failedCount: 0,
      queuedCount: 0,
      runningCount: 0,
      unresolvedApprovalCount: 0,
      unresolvedResourceRequestCount: 0,
      workstreamCount: 0,
    },
    artifacts: [],
    connection: { lastEventAt: null, status: "connected" },
    eventCursor: { sequence: 0, streamId: "director:test" },
    graphs: [],
    hasMoreWorkstreams: false,
    schemaVersion: 1,
    selectedWorkstreamId: null,
    unresolvedApprovals: [],
    unresolvedResourceRequests: [],
    workstreams: [],
  };
}
