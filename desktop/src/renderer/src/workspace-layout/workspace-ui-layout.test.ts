import { afterEach, describe, expect, test, vi } from "vitest";

import { initialWorkspaceUILayoutLoadState } from "./workspace-ui-layout";

describe("workspace UI layout loading", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("starts non-empty real workspaces in loading state when app pane layout reads are available", () => {
    vi.stubGlobal("window", {
      setta: {
        appLayout: {
          readPaneLayout: vi.fn(),
        },
      },
    });

    expect(initialWorkspaceUILayoutLoadState("workspace_api", "workspace")).toStrictEqual({
      error: null,
      key: "workspace:workspace_api",
      layout: null,
      maximizedPaneId: null,
      status: "loading",
    });
  });

  test("does not block benchmark workspaces on app pane layout reads", () => {
    vi.stubGlobal("window", {
      setta: {
        appLayout: {
          readPaneLayout: vi.fn(),
        },
      },
    });

    expect(initialWorkspaceUILayoutLoadState("workspace_api", "benchmark").status).toBe("loaded");
  });

  test("starts empty app-level workspaces in loading state when app pane layout reads are available", () => {
    vi.stubGlobal("window", {
      setta: {
        appLayout: {
          readPaneLayout: vi.fn(),
        },
      },
    });

    expect(initialWorkspaceUILayoutLoadState("empty", "workspace")).toStrictEqual({
      error: null,
      key: "workspace:empty",
      layout: null,
      maximizedPaneId: null,
      status: "loading",
    });
  });
});
