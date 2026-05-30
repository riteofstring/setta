import type { WorkspaceSession } from "@generated/backend";
import { create } from "zustand";

export type WorkspaceStatus = "idle" | "loading" | "ready" | "error";
export type WorkspaceOperation =
  | "closing"
  | "opening"
  | "removingRecent"
  | "reordering"
  | "selecting"
  | null;

interface WorkspaceStore {
  error: string | null;
  loadSession: () => Promise<void>;
  closeWorkspace: (id: string) => Promise<void>;
  openLocalFolder: () => Promise<void>;
  operation: WorkspaceOperation;
  removeRecent: (id: string) => Promise<void>;
  reorderWorkspaces: (ids: string[]) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  session: WorkspaceSession | null;
  status: WorkspaceStatus;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  closeWorkspace: async (id: string) => {
    set({ error: null, operation: "closing" });
    try {
      const session = await window.setta.workspace.close(id);
      set({ operation: null, session, status: "ready" });
    } catch (error) {
      set({ error: errorMessage(error), operation: null, status: "error" });
    }
  },
  error: null,
  loadSession: async () => {
    set({ error: null, status: "loading" });
    try {
      const session = await window.setta.workspace.session();
      set({ session, status: "ready" });
    } catch (error) {
      set({ error: errorMessage(error), status: "error" });
    }
  },
  openLocalFolder: async () => {
    set({ error: null, operation: "opening" });
    try {
      const response = await window.setta.workspace.openLocalFolder();
      if (response === null) {
        set({ operation: null });
        return;
      }
      set({ operation: null, session: response.session, status: "ready" });
    } catch (error) {
      set({ error: errorMessage(error), operation: null, status: "error" });
    }
  },
  operation: null,
  removeRecent: async (id: string) => {
    set({ error: null, operation: "removingRecent" });
    try {
      const session = await window.setta.workspace.removeRecent(id);
      set({ operation: null, session, status: "ready" });
    } catch (error) {
      set({ error: errorMessage(error), operation: null, status: "error" });
    }
  },
  reorderWorkspaces: async (ids: string[]) => {
    set({ error: null, operation: "reordering" });
    try {
      const session = await window.setta.workspace.reorder(ids);
      set({ operation: null, session, status: "ready" });
    } catch (error) {
      set({ error: errorMessage(error), operation: null, status: "error" });
    }
  },
  selectWorkspace: async (id: string) => {
    set({ error: null, operation: "selecting" });
    try {
      const session = await window.setta.workspace.select(id);
      set({ operation: null, session, status: "ready" });
    } catch (error) {
      set({ error: errorMessage(error), operation: null, status: "error" });
    }
  },
  session: null,
  status: "idle",
}));

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Workspace operation failed";
}
