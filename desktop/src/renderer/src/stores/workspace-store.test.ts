import type { OpenWorkspaceResponse, WorkspaceSession } from "@generated/backend";
import type { SettaAPI } from "@shared/types";
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
    const opened = workspaceSession("workspace_web");
    const closed = { ...selected, activeWorkspaces: [], selectedWorkspaceId: "" };
    const reordered = {
      ...selected,
      activeWorkspaces: [...selected.activeWorkspaces].reverse(),
    };
    const removed = { ...selected, recentWorkspaces: [] };
    installSettaAPI({
      workspace: {
        close: vi.fn().mockResolvedValue(closed),
        openPath: vi.fn().mockResolvedValue({
          session: opened,
          workspace: firstWorkspace(opened),
        }),
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

    await useWorkspaceStore.getState().openWorkspacePath("/tmp/web");
    expect(useWorkspaceStore.getState().session).toEqual(opened);

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

  test("clears workspace errors without fabricating a ready session", () => {
    useWorkspaceStore.setState({ error: "workspace failed", session: null, status: "error" });

    useWorkspaceStore.getState().clearError();

    expect(useWorkspaceStore.getState().error).toBeNull();
    expect(useWorkspaceStore.getState().status).toBe("idle");
  });

  test("newer operation result wins over older operation result", async () => {
    const older = deferred<WorkspaceSession>();
    const newer = deferred<WorkspaceSession>();
    const olderSession = workspaceSession("workspace_api");
    const newerSession = workspaceSession("workspace_web");
    installSettaAPI({
      workspace: {
        close: vi.fn().mockReturnValue(older.promise),
        select: vi.fn().mockReturnValue(newer.promise),
      },
    });

    const closePromise = useWorkspaceStore.getState().closeWorkspace("workspace_api");
    const selectPromise = useWorkspaceStore.getState().selectWorkspace("workspace_web");
    newer.resolve(newerSession);
    await selectPromise;
    older.resolve(olderSession);
    await closePromise;

    expect(useWorkspaceStore.getState().session).toEqual(newerSession);
    expect(useWorkspaceStore.getState().operation).toBeNull();
    expect(useWorkspaceStore.getState().status).toBe("ready");
  });

  test("stale older rejection does not overwrite newer success", async () => {
    const older = deferred<WorkspaceSession>();
    const newer = deferred<WorkspaceSession>();
    const newerSession = workspaceSession("workspace_web");
    installSettaAPI({
      workspace: {
        close: vi.fn().mockReturnValue(older.promise),
        select: vi.fn().mockReturnValue(newer.promise),
      },
    });

    const closePromise = useWorkspaceStore.getState().closeWorkspace("workspace_api");
    const selectPromise = useWorkspaceStore.getState().selectWorkspace("workspace_web");
    newer.resolve(newerSession);
    await selectPromise;
    older.reject(new Error("stale close failed"));
    await closePromise;

    expect(useWorkspaceStore.getState().session).toEqual(newerSession);
    expect(useWorkspaceStore.getState().error).toBeNull();
    expect(useWorkspaceStore.getState().status).toBe("ready");
  });

  test("stale older success does not clear a newer operation", async () => {
    const older = deferred<WorkspaceSession>();
    const newer = deferred<WorkspaceSession>();
    installSettaAPI({
      workspace: {
        close: vi.fn().mockReturnValue(newer.promise),
        select: vi.fn().mockReturnValue(older.promise),
      },
    });

    const selectPromise = useWorkspaceStore.getState().selectWorkspace("workspace_api");
    const closePromise = useWorkspaceStore.getState().closeWorkspace("workspace_web");
    older.resolve(workspaceSession("workspace_api"));
    await selectPromise;

    expect(useWorkspaceStore.getState().operation).toBe("closing");

    newer.resolve(workspaceSession("workspace_web"));
    await closePromise;
    expect(useWorkspaceStore.getState().operation).toBeNull();
  });

  test("stale canceled folder open does not clear a newer operation", async () => {
    const older = deferred<OpenWorkspaceResponse | null>();
    const newer = deferred<WorkspaceSession>();
    installSettaAPI({
      workspace: {
        openLocalFolder: vi.fn().mockReturnValue(older.promise),
        select: vi.fn().mockReturnValue(newer.promise),
      },
    });

    const openPromise = useWorkspaceStore.getState().openLocalFolder();
    const selectPromise = useWorkspaceStore.getState().selectWorkspace("workspace_web");
    older.resolve(null);
    await openPromise;

    expect(useWorkspaceStore.getState().operation).toBe("selecting");

    newer.resolve(workspaceSession("workspace_web"));
    await selectPromise;
    expect(useWorkspaceStore.getState().operation).toBeNull();
  });

  test("stale session load does not replace a newer operation result", async () => {
    const older = deferred<WorkspaceSession>();
    const newer = deferred<WorkspaceSession>();
    const newerSession = workspaceSession("workspace_web");
    installSettaAPI({
      workspace: {
        select: vi.fn().mockReturnValue(newer.promise),
        session: vi.fn().mockReturnValue(older.promise),
      },
    });

    const loadPromise = useWorkspaceStore.getState().loadSession();
    const selectPromise = useWorkspaceStore.getState().selectWorkspace("workspace_web");
    newer.resolve(newerSession);
    await selectPromise;
    older.resolve(workspaceSession("workspace_api"));
    await loadPromise;

    expect(useWorkspaceStore.getState().session).toEqual(newerSession);
    expect(useWorkspaceStore.getState().status).toBe("ready");
  });

  test("runtime reset clears session and ignores in-flight session loads", async () => {
    const pending = deferred<WorkspaceSession>();
    useWorkspaceStore.setState({
      error: "local workspace error",
      operation: "opening",
      session: workspaceSession("workspace_local"),
      status: "ready",
    });
    installSettaAPI({
      workspace: {
        session: vi.fn().mockReturnValue(pending.promise),
      },
    });

    const loadPromise = useWorkspaceStore.getState().loadSession();
    useWorkspaceStore.getState().resetRuntimeState();
    pending.resolve(workspaceSession("workspace_stale"));
    await loadPromise;

    expect(useWorkspaceStore.getState().error).toBeNull();
    expect(useWorkspaceStore.getState().operation).toBeNull();
    expect(useWorkspaceStore.getState().session).toBeNull();
    expect(useWorkspaceStore.getState().status).toBe("idle");
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
    openPath: async () => ({ session: fallbackSession, workspace: fallbackWorkspace }),
    readUILayout: async (workspaceId) => ({ layout: null, workspaceId }),
    removeRecent: async () => fallbackSession,
    reorder: async () => fallbackSession,
    saveUILayout: async (layout) => layout,
    select: async () => fallbackSession,
    session: async () => fallbackSession,
    ...overrides.workspace,
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setta: { workspace: workspaceAPI } as unknown as SettaAPI,
    },
  });
}

interface Deferred<T> {
  promise: Promise<T>;
  reject: (error: Error) => void;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: Deferred<T>["resolve"] | null = null;
  let reject: Deferred<T>["reject"] | null = null;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  if (!resolve || !reject) {
    throw new Error("deferred promise callbacks were not initialized");
  }
  return { promise, reject, resolve };
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
