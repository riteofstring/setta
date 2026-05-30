import type { BackendHealth, WorkspaceSession, WorkspaceSummary } from "@generated/backend";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  CircleCheck,
  FolderOpen,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RuntimeVersions } from "@shared/types";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";
import { cn } from "./lib/utils";
import {
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
  const browserHostRef = useRef<HTMLDivElement | null>(null);
  const { backend, refreshHealth } = useBackendState();
  const runtime = useRuntimeVersions();
  const workspace = useWorkspaceViewState();
  useBrowserPaneSync(browserHostRef);

  return (
    <div className="grid min-h-screen grid-rows-[56px_1fr] bg-zinc-50 text-zinc-950">
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
      <main className="grid min-h-0 grid-cols-[260px_1fr]">
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
        <section className="grid min-h-0 grid-rows-[180px_1fr] gap-4 p-4">
          <WorkspacePanel
            error={workspace.error}
            openLocalFolder={workspace.openLocalFolder}
            operation={workspace.operation}
            selectedWorkspace={workspace.selectedWorkspace}
            status={workspace.status}
          />
          <div
            id="browser"
            className="grid min-h-0 grid-rows-[40px_1fr] rounded-lg border border-zinc-200 bg-white shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4">
              <h2 className="text-sm font-semibold">Browser Pane</h2>
              <Badge variant="neutral">Local Preview</Badge>
            </div>
            <div
              ref={browserHostRef}
              className="min-h-0 bg-white"
              data-testid="browser-pane-host"
            />
          </div>
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

function useBrowserPaneSync(browserHostRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const host = browserHostRef.current;
    if (!host) {
      return;
    }

    const syncBounds = () => {
      const rect = host.getBoundingClientRect();
      void window.setta.browserPane.setBounds({
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      });
    };

    syncBounds();
    void window.setta.browserPane.loadPreview();

    const observer = new ResizeObserver(syncBounds);
    observer.observe(host);
    window.addEventListener("resize", syncBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncBounds);
    };
  }, [browserHostRef]);
}

export function WorkspaceSidebar({
  activeWorkspaces,
  busy,
  closeWorkspace,
  openLocalFolder,
  recentWorkspaces,
  removeRecent,
  reorderWorkspaces,
  selectWorkspace,
  selectedWorkspaceId,
}: {
  activeWorkspaces: WorkspaceSummary[];
  busy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  openLocalFolder: () => Promise<void>;
  recentWorkspaces: WorkspaceSummary[];
  removeRecent: (id: string) => Promise<void>;
  reorderWorkspaces: (ids: string[]) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selectedWorkspaceId: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Workspaces</h2>
        <Button
          aria-label="Open workspace folder"
          className="h-8 px-2"
          disabled={busy}
          onClick={() => void openLocalFolder()}
          title="Open workspace folder"
        >
          <FolderOpen className="h-4 w-4" />
          Open
        </Button>
      </div>
      <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
        <WorkspaceList
          activeWorkspaces={activeWorkspaces}
          busy={busy}
          closeWorkspace={closeWorkspace}
          reorderWorkspaces={reorderWorkspaces}
          selectWorkspace={selectWorkspace}
          selectedWorkspaceId={selectedWorkspaceId}
        />
        <Separator className="my-5" />
        <RecentWorkspaceList
          activeWorkspaceIds={new Set(activeWorkspaces.map((workspace) => workspace.id))}
          busy={busy}
          recentWorkspaces={recentWorkspaces}
          removeRecent={removeRecent}
        />
      </div>
    </div>
  );
}

function WorkspaceList({
  activeWorkspaces,
  busy,
  closeWorkspace,
  reorderWorkspaces,
  selectWorkspace,
  selectedWorkspaceId,
}: {
  activeWorkspaces: WorkspaceSummary[];
  busy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  reorderWorkspaces: (ids: string[]) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selectedWorkspaceId: string;
}) {
  if (activeWorkspaces.length === 0) {
    return <p className="text-sm text-zinc-500">No active workspaces</p>;
  }

  return (
    <div className="space-y-1" data-testid="active-workspace-list">
      {activeWorkspaces.map((workspace, index) => (
        <div
          className={cn(
            "grid grid-cols-[1fr_auto] gap-1 rounded-md border px-2 py-2",
            workspace.id === selectedWorkspaceId
              ? "border-zinc-300 bg-zinc-100"
              : "border-transparent bg-white hover:border-zinc-200",
          )}
          data-testid="active-workspace-item"
          key={workspace.id}
        >
          <button
            className="min-w-0 text-left"
            data-testid="active-workspace-select"
            disabled={busy}
            onClick={() => void selectWorkspace(workspace.id)}
          >
            <span className="block truncate text-sm font-medium">{workspace.displayName}</span>
            <span className="mt-0.5 block truncate text-xs text-zinc-500">
              {workspace.rootPath}
            </span>
          </button>
          <div className="flex items-center gap-1">
            <IconButton
              disabled={busy || index === 0}
              label="Move workspace up"
              onClick={() => void moveWorkspace(activeWorkspaces, index, -1, reorderWorkspaces)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              disabled={busy || index === activeWorkspaces.length - 1}
              label="Move workspace down"
              onClick={() => void moveWorkspace(activeWorkspaces, index, 1, reorderWorkspaces)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              disabled={busy}
              label="Close workspace"
              onClick={() => void closeWorkspace(workspace.id)}
            >
              <X className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentWorkspaceList({
  activeWorkspaceIds,
  busy,
  recentWorkspaces,
  removeRecent,
}: {
  activeWorkspaceIds: Set<string>;
  busy: boolean;
  recentWorkspaces: WorkspaceSummary[];
  removeRecent: (id: string) => Promise<void>;
}) {
  if (recentWorkspaces.length === 0) {
    return (
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-normal text-zinc-500">Recent</h3>
        <p className="mt-3 text-sm text-zinc-500">No recent workspaces</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-normal text-zinc-500">Recent</h3>
      <div className="mt-3 space-y-1" data-testid="recent-workspace-list">
        {recentWorkspaces.map((workspace) => {
          const active = activeWorkspaceIds.has(workspace.id);
          return (
            <div
              className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md px-2 py-2"
              data-testid="recent-workspace-item"
              key={workspace.id}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-zinc-800">
                  {workspace.displayName}
                </div>
                <div className="truncate text-xs text-zinc-500">{workspace.rootPath}</div>
              </div>
              <IconButton
                disabled={busy || active}
                label="Remove recent workspace"
                onClick={() => void removeRecent(workspace.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          );
        })}
      </div>
    </div>
  );
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
    <div id="workspace" className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex h-full items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-950">Workspace</h2>
            {status === "loading" ? <Badge variant="neutral">Loading</Badge> : null}
            {operation ? <Badge variant="neutral">{operationLabel(operation)}</Badge> : null}
          </div>
          {selectedWorkspace ? (
            <div className="mt-5 min-w-0">
              <div className="truncate text-2xl font-semibold">{selectedWorkspace.displayName}</div>
              <div
                className="mt-2 truncate text-sm text-zinc-500"
                data-testid="selected-workspace-path"
              >
                {selectedWorkspace.rootPath}
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <div className="text-2xl font-semibold">No workspace open</div>
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

function IconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function moveWorkspace(
  activeWorkspaces: WorkspaceSummary[],
  index: number,
  direction: -1 | 1,
  reorderWorkspaces: (ids: string[]) => Promise<void>,
) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= activeWorkspaces.length) {
    return;
  }
  const ids = activeWorkspaces.map((workspace) => workspace.id);
  const currentID = ids[index];
  const targetID = ids[targetIndex];
  if (currentID === undefined || targetID === undefined) {
    return;
  }
  ids[index] = targetID;
  ids[targetIndex] = currentID;
  void reorderWorkspaces(ids);
}

function operationLabel(operation: Exclude<WorkspaceOperation, null>) {
  switch (operation) {
    case "closing":
      return "Closing";
    case "opening":
      return "Opening";
    case "removingRecent":
      return "Removing";
    case "reordering":
      return "Reordering";
    case "selecting":
      return "Selecting";
  }
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
