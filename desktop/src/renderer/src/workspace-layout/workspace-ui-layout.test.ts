import { afterEach, describe, expect, test, vi } from "vitest";

import { initialWorkspaceUILayoutLoadState } from "./workspace-ui-layout";

describe("workspace UI layout loading", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("starts non-empty real workspaces in loading state when persisted layout reads are available", () => {
    vi.stubGlobal("window", {
      setta: {
        workspace: {
          readUILayout: vi.fn(),
        },
      },
    });

    expect(initialWorkspaceUILayoutLoadState("workspace_api", "workspace")).toStrictEqual({
      error: null,
      key: "workspace:workspace_api",
      layout: null,
      status: "loading",
    });
  });

  test("does not block benchmark or empty workspaces on persisted UI layout reads", () => {
    vi.stubGlobal("window", {
      setta: {
        workspace: {
          readUILayout: vi.fn(),
        },
      },
    });

    expect(initialWorkspaceUILayoutLoadState("workspace_api", "benchmark").status).toBe("loaded");
    expect(initialWorkspaceUILayoutLoadState("empty", "workspace").status).toBe("loaded");
  });
});
