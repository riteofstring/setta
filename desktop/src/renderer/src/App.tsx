import type { BackendHealth, WorkspaceSession, WorkspaceSummary } from "@generated/backend";
import { CircleAlert, CircleCheck, FolderOpen, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { RuntimeVersions } from "@shared/types";
import { ChatPanel } from "./components/chat-panel";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";
import {
  type WorkspaceOperationKind,
  type WorkspaceOperation,
  type WorkspaceStatus,
  useWorkspaceStore,
} from "./stores/workspace-store";

type BackendState =
  | { health: BackendHealth; message: string; status: "online" }
  | { health: null; message: string; status: "checking" | "offline" };

const initialBackendState: BackendState = {
  health: null,
  message: "Checking",
  status: "checking",
};

export function App() {
  const { backend, refreshHealth } = useBackendState();
  const runtime = useRuntimeVersions();
  const workspace = useWorkspaceViewState();

  return (
    <div className="grid h-screen min-h-0 grid-rows-[56px_minmax(0,1fr)] overflow-hidden bg-zinc-50 text-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-5">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-semibold">Setta</h1>
          <BackendBadge backend={backend} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">Electron {runtime.electron}</span>
          <Button aria-label="Refresh backend health" onClick={() => void refreshHealth()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </header>
      <main className="grid min-h-0 min-w-0 grid-cols-[260px_1fr] overflow-hidden">
        <aside className="flex min-h-0 flex-col border-r border-zinc-200 bg-white">
          <WorkspaceSidebar
            activeWorkspaces={workspace.activeWorkspaces}
            busy={workspace.busy}
            closeWorkspace={workspace.closeWorkspace}
            openLocalFolder={workspace.openLocalFolder}
            recentWorkspaces={workspace.recentWorkspaces}
            removeRecent={workspace.removeRecent}
            reorderWorkspaces={workspace.reorderWorkspaces}
            selectWorkspace={workspace.selectWorkspace}
            selectedWorkspaceId={workspace.selectedWorkspaceId}
          />
          <Separator className="my-5" />
          <dl className="space-y-3 px-4 pb-5 text-xs">
            <div>
              <dt className="text-zinc-500">Backend</dt>
              <dd className="mt-1 break-words font-medium text-zinc-800">{backend.message}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Runtime</dt>
              <dd className="mt-1 text-zinc-800">Node {runtime.node}</dd>
            </div>
          </dl>
        </aside>
        <section className="grid min-h-0 min-w-0 grid-rows-[132px_minmax(0,1fr)] overflow-hidden">
          <WorkspacePanel
            error={workspace.error}
            openLocalFolder={workspace.openLocalFolder}
            operation={workspace.operation}
            selectedWorkspace={workspace.selectedWorkspace}
            status={workspace.status}
          />
          <ChatPanel workspace={workspace.selectedWorkspace} />
        </section>
      </main>
    </div>
  );
}

function useBackendState() {
  const [backend, setBackend] = useState<BackendState>(initialBackendState);
  const refreshHealth = useCallback(async () => {
    setBackend({ health: null, message: "Checking", status: "checking" });
    try {
      const health = await window.setta.backend.health();
      setBackend({ health, message: `${health.name} ${health.version}`, status: "online" });
    } catch (error) {
      setBackend({
        health: null,
        message: error instanceof Error ? error.message : "Backend unavailable",
        status: "offline",
      });
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  return { backend, refreshHealth };
}

function useRuntimeVersions() {
  const [versions, setVersions] = useState<RuntimeVersions | null>(null);
  useEffect(() => {
    void window.setta.app.versions().then(setVersions);
  }, []);
  return {
    electron: versions?.electron ?? "--",
    node: versions?.node ?? "--",
  };
}

function useWorkspaceViewState() {
  const closeWorkspace = useWorkspaceStore((state) => state.closeWorkspace);
  const error = useWorkspaceStore((state) => state.error);
  const loadSession = useWorkspaceStore((state) => state.loadSession);
  const openLocalFolder = useWorkspaceStore((state) => state.openLocalFolder);
  const operation = useWorkspaceStore((state) => state.operation);
  const removeRecent = useWorkspaceStore((state) => state.removeRecent);
  const reorderWorkspaces = useWorkspaceStore((state) => state.reorderWorkspaces);
  const selectWorkspace = useWorkspaceStore((state) => state.selectWorkspace);
  const session = useWorkspaceStore((state) => state.session);
  const status = useWorkspaceStore((state) => state.status);
  const selectedWorkspace = useSelectedWorkspace(session);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  return {
    activeWorkspaces: session?.activeWorkspaces ?? [],
    busy: operation !== null || status === "loading",
    closeWorkspace,
    error,
    openLocalFolder,
    operation,
    recentWorkspaces: session?.recentWorkspaces ?? [],
    removeRecent,
    reorderWorkspaces,
    selectWorkspace,
    selectedWorkspace,
    selectedWorkspaceId: session?.selectedWorkspaceId ?? "",
    status,
  };
}

function useSelectedWorkspace(session: WorkspaceSession | null) {
  return useMemo(() => {
    return (
      session?.activeWorkspaces.find((workspace) => workspace.id === session.selectedWorkspaceId) ??
      null
    );
  }, [session]);
}

export function WorkspacePanel({
  error,
  openLocalFolder,
  operation,
  selectedWorkspace,
  status,
}: {
  error: string | null;
  openLocalFolder: () => Promise<void>;
  operation: WorkspaceOperation;
  selectedWorkspace: WorkspaceSummary | null;
  status: WorkspaceStatus;
}) {
  const busy = operation !== null || status === "loading";
  return (
    <div id="workspace" className="border-b border-zinc-200 bg-white p-4">
      <div className="flex h-full items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-950">Workspace</h2>
            {status === "loading" ? <Badge variant="neutral">Loading</Badge> : null}
            {operation ? <Badge variant="neutral">{operationLabel(operation)}</Badge> : null}
          </div>
          {selectedWorkspace ? (
            <div className="mt-5 min-w-0">
              <div className="truncate text-xl font-semibold">{selectedWorkspace.displayName}</div>
              <div
                className="mt-2 truncate text-sm text-zinc-500"
                data-testid="selected-workspace-path"
              >
                {selectedWorkspace.rootPath}
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <div className="text-xl font-semibold">No workspace open</div>
              <Button
                className="mt-4"
                disabled={busy}
                onClick={() => void openLocalFolder()}
                variant="primary"
              >
                <FolderOpen className="h-4 w-4" />
                Open Folder
              </Button>
            </div>
          )}
          {error ? (
            <div
              className="mt-4 max-w-3xl rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              data-testid="workspace-error"
            >
              {error}
            </div>
          ) : null}
        </div>
        <Badge variant={selectedWorkspace ? "success" : "neutral"}>
          {selectedWorkspace ? "Active" : "Empty"}
        </Badge>
      </div>
    </div>
  );
}

const operationLabels = {
  closing: "Closing",
  opening: "Opening",
  removingRecent: "Removing",
  reordering: "Reordering",
  selecting: "Selecting",
} satisfies Record<WorkspaceOperationKind, string>;

function operationLabel(operation: WorkspaceOperationKind) {
  return operationLabels[operation];
}

function BackendBadge({ backend }: { backend: BackendState }) {
  if (backend.status === "online") {
    return (
      <Badge data-testid="backend-status" variant="success">
        <CircleCheck className="h-3.5 w-3.5" />
        Online
      </Badge>
    );
  }
  if (backend.status === "offline") {
    return (
      <Badge data-testid="backend-status" variant="danger">
        <CircleAlert className="h-3.5 w-3.5" />
        Offline
      </Badge>
    );
  }
  return <Badge data-testid="backend-status">Checking</Badge>;
}
