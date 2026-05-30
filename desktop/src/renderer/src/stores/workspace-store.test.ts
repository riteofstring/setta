import type { BackendHealth, OpenWorkspaceResponse, WorkspaceSession } from "@generated/backend";
import type { RuntimeVersions, SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useWorkspaceStore } from "./workspace-store";

describe("workspace store", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      error: null,
      operation: null,
      session: null,
      status: "idle",
    });
  });

  test("loads the authoritative backend session", async () => {
    const session = workspaceSession("workspace_api");
    const sessionMock = vi.fn().mockResolvedValue(session);
    installSettaAPI({
      workspace: {
        session: sessionMock,
      },
    });

    await useWorkspaceStore.getState().loadSession();

    expect(useWorkspaceStore.getState().session).toEqual(session);
    expect(useWorkspaceStore.getState().status).toBe("ready");
    expect(sessionMock).toHaveBeenCalledOnce();
  });

  test("open local folder updates from backend response", async () => {
    const session = workspaceSession("workspace_web");
    const response: OpenWorkspaceResponse = {
      session,
      workspace: firstWorkspace(session),
    };
    installSettaAPI({
      workspace: {
        openLocalFolder: vi.fn().mockResolvedValue(response),
      },
    });

    await useWorkspaceStore.getState().openLocalFolder();

    expect(useWorkspaceStore.getState().session).toEqual(session);
    expect(useWorkspaceStore.getState().operation).toBeNull();
    expect(useWorkspaceStore.getState().status).toBe("ready");
  });

  test("canceled open dialog does not mutate the current session", async () => {
    const session = workspaceSession("workspace_api");
    useWorkspaceStore.setState({ session, status: "ready" });
    installSettaAPI({
      workspace: {
        openLocalFolder: vi.fn().mockResolvedValue(null),
      },
    });

    await useWorkspaceStore.getState().openLocalFolder();

    expect(useWorkspaceStore.getState().session).toEqual(session);
    expect(useWorkspaceStore.getState().operation).toBeNull();
  });

  test("select close reorder and remove recent replace state from backend responses", async () => {
    const selected = workspaceSession("workspace_api");
    const closed = { ...selected, activeWorkspaces: [], selectedWorkspaceId: "" };
    const reordered = {
      ...selected,
      activeWorkspaces: [...selected.activeWorkspaces].reverse(),
    };
    const removed = { ...selected, recentWorkspaces: [] };
    installSettaAPI({
      workspace: {
        close: vi.fn().mockResolvedValue(closed),
        removeRecent: vi.fn().mockResolvedValue(removed),
        reorder: vi.fn().mockResolvedValue(reordered),
        select: vi.fn().mockResolvedValue(selected),
      },
    });

    await useWorkspaceStore.getState().selectWorkspace("workspace_api");
    expect(useWorkspaceStore.getState().session).toEqual(selected);

    await useWorkspaceStore.getState().reorderWorkspaces(["workspace_web", "workspace_api"]);
    expect(useWorkspaceStore.getState().session).toEqual(reordered);

    await useWorkspaceStore.getState().closeWorkspace("workspace_api");
    expect(useWorkspaceStore.getState().session).toEqual(closed);

    await useWorkspaceStore.getState().removeRecent("workspace_api");
    expect(useWorkspaceStore.getState().session).toEqual(removed);
  });

  test("stores specific backend errors for the renderer", async () => {
    installSettaAPI({
      workspace: {
        session: vi.fn().mockRejectedValue(new Error("workspace path does not exist")),
      },
    });

    await useWorkspaceStore.getState().loadSession();

    expect(useWorkspaceStore.getState().status).toBe("error");
    expect(useWorkspaceStore.getState().error).toBe("workspace path does not exist");
  });
});

interface SettaAPIOverrides {
  workspace?: Partial<SettaAPI["workspace"]>;
}

function installSettaAPI(overrides: SettaAPIOverrides) {
  const fallbackSession = workspaceSession("workspace_api");
  const fallbackWorkspace = firstWorkspace(fallbackSession);
  const workspaceAPI: SettaAPI["workspace"] = {
    close: async () => fallbackSession,
    openLocalFolder: async () => ({ session: fallbackSession, workspace: fallbackWorkspace }),
    removeRecent: async () => fallbackSession,
    reorder: async () => fallbackSession,
    select: async () => fallbackSession,
    session: async () => fallbackSession,
    ...overrides.workspace,
  };
  const api: SettaAPI = {
    app: {
      versions: async (): Promise<RuntimeVersions> => ({
        app: "test",
        chrome: "test",
        electron: "test",
        node: "test",
      }),
    },
    backend: {
      health: async (): Promise<BackendHealth> => ({
        name: "setta-backend",
        ok: true,
        version: "test",
      }),
    },
    browserPane: {
      captureScreenshot: async () => ({ height: 1, pngBytes: 1, width: 1 }),
      click: async () => {},
      events: async () => ({ console: [], network: [] }),
      focus: async () => {},
      inspect: async () => null,
      loadPreview: async () => ({
        bounds: { height: 1, width: 1, x: 0, y: 0 },
        focused: false,
        url: "",
      }),
      setBounds: async () => ({
        bounds: { height: 1, width: 1, x: 0, y: 0 },
        focused: false,
        url: "",
      }),
      status: async () => ({
        bounds: { height: 1, width: 1, x: 0, y: 0 },
        focused: false,
        url: "",
      }),
      typeText: async () => {},
    },
    workspace: workspaceAPI,
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setta: api,
    },
  });
}

function firstWorkspace(session: WorkspaceSession) {
  const workspace = session.activeWorkspaces[0];
  if (workspace === undefined) {
    throw new Error("test session must include an active workspace");
  }
  return workspace;
}

function workspaceSession(selectedWorkspaceId: string): WorkspaceSession {
  return {
    activeWorkspaces: [
      {
        displayName: "api",
        id: "workspace_api",
        lastOpenedAt: "2026-05-29T20:00:00Z",
        rootPath: "/tmp/api",
      },
      {
        displayName: "web",
        id: "workspace_web",
        lastOpenedAt: "2026-05-29T20:05:00Z",
        rootPath: "/tmp/web",
      },
    ],
    recentWorkspaces: [
      {
        displayName: "web",
        id: "workspace_web",
        lastOpenedAt: "2026-05-29T20:05:00Z",
        rootPath: "/tmp/web",
      },
      {
        displayName: "api",
        id: "workspace_api",
        lastOpenedAt: "2026-05-29T20:00:00Z",
        rootPath: "/tmp/api",
      },
    ],
    selectedWorkspaceId,
  };
}
