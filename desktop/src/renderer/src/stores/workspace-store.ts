import type { WorkspaceAvailability, WorkspaceSession } from "@generated/backend";
import { create } from "zustand";

export type WorkspaceStatus = "idle" | "loading" | "ready" | "error";
export type WorkspaceOperationKind =
  | "closing"
  | "opening"
  | "relocating"
  | "refreshing"
  | "removingRecent"
  | "reordering"
  | "selecting";
export type WorkspaceOperation = WorkspaceOperationKind | null;

interface WorkspaceStore {
  clearError: () => void;
  error: string | null;
  loadSession: () => Promise<void>;
  closeWorkspace: (id: string) => Promise<void>;
  openLocalFolder: () => Promise<void>;
  openWorkspacePath: (rootPath: string) => Promise<void>;
  relocateWorkspace: (id: string) => Promise<void>;
  refreshWorkspaceAvailability: (id: string) => Promise<void>;
  operation: WorkspaceOperation;
  removeRecent: (id: string) => Promise<void>;
  reorderWorkspaces: (ids: string[]) => Promise<void>;
  resetRuntimeState: () => void;
  selectWorkspace: (id: string) => Promise<void>;
  session: WorkspaceSession | null;
  status: WorkspaceStatus;
}

type WorkspaceStatePatch = Partial<
  Pick<WorkspaceStore, "error" | "operation" | "session" | "status">
>;

let operationSequence = 0;
let currentOperationId = 0;

export const useWorkspaceStore = create<WorkspaceStore>((set) => {
  function beginOperation(patch: WorkspaceStatePatch) {
    operationSequence += 1;
    currentOperationId = operationSequence;
    set(patch);
    return currentOperationId;
  }

  function commitCurrentOperation(operationId: number, patch: WorkspaceStatePatch) {
    if (operationId !== currentOperationId) {
      return;
    }
    currentOperationId = 0;
    set(patch);
  }

  async function runWorkspaceOperation<Result>(
    kind: WorkspaceOperationKind,
    action: () => Promise<Result>,
    successPatch: (result: Result) => WorkspaceStatePatch,
  ) {
    const operationId = beginOperation({ error: null, operation: kind });
    try {
      const result = await action();
      commitCurrentOperation(operationId, successPatch(result));
    } catch (error) {
      commitCurrentOperation(operationId, {
        error: errorMessage(error),
        operation: null,
        status: "error",
      });
    }
  }

  return {
    clearError: () =>
      set((current) => ({ error: null, status: current.session ? "ready" : "idle" })),
    closeWorkspace: (id: string) =>
      runWorkspaceOperation("closing", () => window.setta.workspace.close(id), sessionReadyPatch),
    error: null,
    loadSession: async () => {
      const operationId = beginOperation({ error: null, operation: null, status: "loading" });
      try {
        const session = await window.setta.workspace.session();
        commitCurrentOperation(operationId, { operation: null, session, status: "ready" });
      } catch (error) {
        commitCurrentOperation(operationId, {
          error: errorMessage(error),
          operation: null,
          status: "error",
        });
      }
    },
    openLocalFolder: () =>
      runWorkspaceOperation(
        "opening",
        () => window.setta.workspace.openLocalFolder(),
        (response) =>
          response === null
            ? { operation: null }
            : { operation: null, session: response.session, status: "ready" },
      ),
    openWorkspacePath: (rootPath: string) =>
      runWorkspaceOperation(
        "opening",
        () => window.setta.workspace.openPath(rootPath),
        (response) => ({ operation: null, session: response.session, status: "ready" }),
      ),
    relocateWorkspace: (id: string) =>
      runWorkspaceOperation(
        "relocating",
        () => window.setta.workspace.relocateLocalFolder(id),
        (response) =>
          response === null
            ? { operation: null }
            : { operation: null, session: response.session, status: "ready" },
      ),
    refreshWorkspaceAvailability: (id: string) =>
      runWorkspaceOperation(
        "refreshing",
        () => window.setta.workspace.refreshAvailability(id),
        sessionReadyPatch,
      ),
    operation: null,
    removeRecent: (id: string) =>
      runWorkspaceOperation(
        "removingRecent",
        () => window.setta.workspace.removeRecent(id),
        sessionReadyPatch,
      ),
    resetRuntimeState: () => {
      operationSequence += 1;
      currentOperationId = operationSequence;
      set({ error: null, operation: null, session: null, status: "idle" });
    },
    reorderWorkspaces: (ids: string[]) =>
      runWorkspaceOperation(
        "reordering",
        () => window.setta.workspace.reorder(ids),
        sessionReadyPatch,
      ),
    selectWorkspace: (id: string) =>
      runWorkspaceOperation(
        "selecting",
        () => window.setta.workspace.select(id),
        sessionReadyPatch,
      ),
    session: null,
    status: "idle",
  };
});

export function workspaceAvailability(
  session: WorkspaceSession | null,
  workspaceId: string | null | undefined,
): WorkspaceAvailability | null {
  if (!session || !workspaceId) {
    return null;
  }
  return (
    session.workspaceAvailabilities.find(
      (availability) => availability.workspaceId === workspaceId,
    ) ?? null
  );
}

function sessionReadyPatch(session: WorkspaceSession): WorkspaceStatePatch {
  return { operation: null, session, status: "ready" };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Workspace operation failed";
}
