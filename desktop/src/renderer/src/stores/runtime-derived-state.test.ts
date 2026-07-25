import type { WorkspaceSession } from "@generated/backend";
import { beforeEach, describe, expect, test } from "vitest";

import { resetRuntimeDerivedRendererState } from "./runtime-derived-state";
import { useWorkspaceStore } from "./workspace-store";

describe("runtime-derived renderer state reset", () => {
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  });

  test("clears runtime-owned workspace state", () => {
    useWorkspaceStore.setState({
      session: workspaceSession("workspace_local"),
      status: "ready",
    });
    resetRuntimeDerivedRendererState();

    expect(useWorkspaceStore.getState()).toMatchObject({
      error: null,
      operation: null,
      session: null,
      status: "idle",
    });
  });
});

function workspaceSession(workspaceId: string): WorkspaceSession {
  return {
    activeWorkspaces: [
      {
        displayName: workspaceId,
        id: workspaceId,
        lastOpenedAt: "2026-07-03T12:00:00Z",
        rootPath: `/tmp/${workspaceId}`,
      },
    ],
    recentWorkspaces: [],
    selectedWorkspaceId: workspaceId,
    workspaceAvailabilities: [{ available: true, unavailableReason: "", workspaceId }],
  };
}
