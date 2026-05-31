import type { BackendHealth, WorkspaceSession, WorkspaceSummary } from "@generated/backend";
import {
  CircleAlert,
  CircleCheck,
  Command,
  FolderOpen,
  GitBranch,
  Globe2,
  PanelTop,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react";
import type { PointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RuntimeVersions } from "@shared/types";
import settaLogo from "../../../img/logo/logo.svg";
import { ChatPanel, useChatViewState } from "./components/chat-panel";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Menubar, type MenubarMenu } from "./components/ui/menubar";
import {
  type WorkspaceOperationKind,
  type WorkspaceOperation,
  type WorkspaceStatus,
  useWorkspaceStore,
} from "./stores/workspace-store";
import { useChatStore } from "./stores/chat-store";

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
  const chat = useChatViewState(workspace.selectedWorkspace?.id ?? null);
  const [projectPaneWidth, setProjectPaneWidth] = useState(220);
  const [chatPaneWidth, setChatPaneWidth] = useState(360);

  useEffect(() => {
    return window.setta.chat.onEvent((event) => {
      useChatStore.getState().handleEvent(event);
    });
  }, []);

  return (
    <div className="grid h-screen min-h-0 grid-rows-[32px_minmax(0,1fr)] overflow-hidden bg-zinc-900 text-zinc-950">
      <AppMenuBar
        backend={backend}
        openLocalFolder={workspace.openLocalFolder}
        refreshHealth={refreshHealth}
        runtime={runtime}
      />
      <main className="flex min-h-0 min-w-0 overflow-hidden bg-zinc-900">
        <ResizablePane
          label="Resize project sidebar"
          maxWidth={320}
          minWidth={176}
          onWidthChange={setProjectPaneWidth}
          width={projectPaneWidth}
        >
          <WorkspaceSidebar
            activeWorkspaces={workspace.activeWorkspaces}
            busy={workspace.busy || chat.operation !== null}
            chatBusy={chat.operation !== null || chat.status === "loading"}
            closeWorkspace={workspace.closeWorkspace}
            conversations={chat.conversations}
            createConversation={chat.createConversation}
            openLocalFolder={workspace.openLocalFolder}
            recentWorkspaces={workspace.recentWorkspaces}
            removeRecent={workspace.removeRecent}
            selectConversation={chat.selectConversation}
            selectWorkspace={workspace.selectWorkspace}
            selectedConversationId={chat.selectedConversation?.id ?? ""}
            selectedWorkspaceId={workspace.selectedWorkspaceId}
          />
        </ResizablePane>
        <ResizablePane
          label="Resize chat"
          maxWidth={560}
          minWidth={300}
          onWidthChange={setChatPaneWidth}
          width={chatPaneWidth}
        >
          <ChatPanel chat={chat} workspace={workspace.selectedWorkspace} />
        </ResizablePane>
        <CanvasPanel
          backend={backend}
          error={workspace.error}
          openLocalFolder={workspace.openLocalFolder}
          operation={workspace.operation}
          runtime={runtime}
          selectedWorkspace={workspace.selectedWorkspace}
          status={workspace.status}
        />
      </main>
    </div>
  );
}

function AppMenuBar({
  backend,
  openLocalFolder,
  refreshHealth,
  runtime,
}: {
  backend: BackendState;
  openLocalFolder: () => Promise<void>;
  refreshHealth: () => Promise<void>;
  runtime: ReturnType<typeof useRuntimeVersions>;
}) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const menus = useMemo<MenubarMenu[]>(
    () => [
      {
        items: [
          {
            label: "Open Project...",
            onSelect: () => void openLocalFolder(),
            shortcut: "cmd o",
          },
          {
            label: "Refresh Backend",
            onSelect: () => void refreshHealth(),
          },
        ],
        label: "Project",
      },
      {
        items: [
          {
            label: "Command Palette",
            onSelect: () => setCommandPaletteOpen(true),
            shortcut: "cmd k",
          },
          {
            label: "Search",
            onSelect: () => setCommandPaletteOpen(true),
          },
        ],
        label: "Edit",
      },
    ],
    [openLocalFolder, refreshHealth],
  );

  useEffect(() => {
    const openFromKeyboard = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) {
        return;
      }
      event.preventDefault();
      setCommandPaletteOpen(true);
    };
    window.addEventListener("keydown", openFromKeyboard);
    return () => {
      window.removeEventListener("keydown", openFromKeyboard);
    };
  }, []);

  return (
    <header className="app-drag grid min-w-0 grid-cols-[1fr_minmax(260px,440px)_1fr] items-center border-b border-zinc-800 bg-zinc-900 py-0 pr-2 pl-20 text-zinc-100">
      <div className="flex min-w-0 items-center gap-3">
        <img
          alt="Setta"
          className="h-4 w-auto max-w-16 shrink-0 grayscale brightness-0 invert"
          src={settaLogo}
        />
        <Menubar className="app-no-drag" menus={menus} />
      </div>
      <button
        aria-haspopup="dialog"
        className="app-no-drag inline-flex h-6 min-w-0 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white"
        onClick={() => setCommandPaletteOpen(true)}
        type="button"
      >
        <Command className="h-3.5 w-3.5" />
        <span className="truncate">Search or run command</span>
        <kbd className="text-[10px] text-zinc-500">cmd k</kbd>
      </button>
      <div className="flex min-w-0 items-center justify-end gap-2 text-xs text-zinc-400">
        <span className="truncate">Electron {runtime.electron}</span>
        <BackendBadge backend={backend} />
        <Button
          aria-label="Refresh backend health"
          className="app-no-drag h-6 border-zinc-700 bg-zinc-800 px-2 text-xs text-zinc-300 hover:bg-zinc-700"
          onClick={() => void refreshHealth()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <CommandPalette onOpenChange={setCommandPaletteOpen} open={commandPaletteOpen} />
    </header>
  );
}

function CommandPalette({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    inputRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="app-no-drag fixed inset-0 z-50 bg-black/35 px-4 pt-16"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
      role="presentation"
    >
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-md border border-zinc-700 bg-zinc-950 text-zinc-100 shadow-2xl">
        <label className="flex h-11 items-center gap-2 border-b border-zinc-800 px-3">
          <Search className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          <Input
            className="h-9 border-0 bg-transparent px-0 shadow-none placeholder:text-zinc-600 focus-visible:border-0"
            placeholder="Search commands, projects, files"
            ref={inputRef}
          />
        </label>
        <div className="p-1">
          {["Open Project", "Switch Workspace", "Search Chat", "Open Settings"].map((command) => (
            <button
              className="flex h-8 w-full items-center justify-between rounded px-2 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white"
              key={command}
              onClick={() => onOpenChange(false)}
              type="button"
            >
              <span>{command}</span>
              {command === "Open Project" ? (
                <kbd className="text-[10px] text-zinc-500">cmd o</kbd>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResizablePane({
  children,
  label,
  maxWidth,
  minWidth,
  onWidthChange,
  width,
}: {
  children: ReactNode;
  label: string;
  maxWidth: number;
  minWidth: number;
  onWidthChange: (width: number) => void;
  width: number;
}) {
  const startResize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const startX = event.clientX;
      const startWidth = width;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      const resize = (moveEvent: globalThis.PointerEvent) => {
        onWidthChange(clamp(startWidth + moveEvent.clientX - startX, minWidth, maxWidth));
      };
      const stopResize = () => {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("pointermove", resize);
      };

      event.preventDefault();
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", resize);
      window.addEventListener("pointerup", stopResize, { once: true });
    },
    [maxWidth, minWidth, onWidthChange, width],
  );

  return (
    <div className="relative h-full min-h-0 shrink-0" style={{ width }}>
      {children}
      <div
        aria-label={label}
        aria-orientation="vertical"
        className="absolute top-0 right-0 z-30 h-full w-2 translate-x-1 cursor-col-resize"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onWidthChange(clamp(width - 12, minWidth, maxWidth));
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            onWidthChange(clamp(width + 12, minWidth, maxWidth));
          }
        }}
        onPointerDown={startResize}
        role="separator"
        tabIndex={0}
      />
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function CanvasPanel({
  backend,
  error,
  openLocalFolder,
  operation,
  runtime,
  selectedWorkspace,
  status,
}: {
  backend: BackendState;
  error: string | null;
  openLocalFolder: () => Promise<void>;
  operation: WorkspaceOperation;
  runtime: ReturnType<typeof useRuntimeVersions>;
  selectedWorkspace: WorkspaceSummary | null;
  status: WorkspaceStatus;
}) {
  const busy = operation !== null || status === "loading";
  return (
    <section className="flex min-w-0 flex-1 bg-zinc-900">
      <div className="relative m-2 ml-0 min-w-0 flex-1 overflow-hidden rounded-md border border-zinc-300 bg-zinc-100">
        <div className="absolute inset-0 grid place-items-center px-8">
          <div className="grid w-full max-w-[500px] grid-cols-[96px_auto_minmax(0,220px)] items-center gap-3">
            <div className="grid h-14 w-24 place-items-center rounded-md bg-zinc-700 text-xs text-white">
              node
            </div>
            <div className="h-0 w-0 border-y-[8px] border-r-[8px] border-y-transparent border-r-zinc-700" />
            <div className="grid h-44 min-w-0 place-items-center rounded-md bg-zinc-700 px-5 text-center text-xs text-white">
              Node details on click
            </div>
          </div>
        </div>
        <CanvasStatus
          backend={backend}
          busy={busy}
          error={error}
          openLocalFolder={openLocalFolder}
          operation={operation}
          runtime={runtime}
          selectedWorkspace={selectedWorkspace}
          status={status}
        />
      </div>
      <ViewTabRail />
    </section>
  );
}

function ViewTabRail() {
  return (
    <aside
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-zinc-800 bg-zinc-900 py-2"
      aria-label="Workspace views"
    >
      <ViewTabButton active label="Canvas">
        <PanelTop className="h-4 w-4" />
      </ViewTabButton>
      <ViewTabButton label="Git">
        <GitBranch className="h-4 w-4" />
      </ViewTabButton>
      <ViewTabButton label="Settings">
        <Settings className="h-4 w-4" />
      </ViewTabButton>
      <ViewTabButton label="Web browser">
        <Globe2 className="h-4 w-4" />
      </ViewTabButton>
    </aside>
  );
}

function ViewTabButton({
  active = false,
  children,
  label,
}: {
  active?: boolean;
  children: ReactNode;
  label: string;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={
        active
          ? "inline-flex h-9 w-9 items-center justify-center rounded-md bg-zinc-100 text-zinc-950"
          : "inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
      }
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function CanvasStatus({
  backend,
  busy,
  error,
  openLocalFolder,
  operation,
  runtime,
  selectedWorkspace,
  status,
}: {
  backend: BackendState;
  busy: boolean;
  error: string | null;
  openLocalFolder: () => Promise<void>;
  operation: WorkspaceOperation;
  runtime: ReturnType<typeof useRuntimeVersions>;
  selectedWorkspace: WorkspaceSummary | null;
  status: WorkspaceStatus;
}) {
  return (
    <aside className="absolute bottom-3 left-3 grid max-w-[380px] gap-2 rounded-md border border-zinc-300 bg-white/85 p-3 text-xs text-zinc-800">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-zinc-950">
          {selectedWorkspace?.displayName ?? "No workspace"}
        </span>
        {status === "loading" ? <Badge>Loading</Badge> : null}
        {operation ? <Badge>{operationLabel(operation)}</Badge> : null}
      </div>
      {selectedWorkspace ? (
        <div className="truncate text-xs text-zinc-600">{selectedWorkspace.rootPath}</div>
      ) : (
        <Button disabled={busy} onClick={() => void openLocalFolder()} variant="primary">
          <FolderOpen className="h-4 w-4" />
          Open Folder
        </Button>
      )}
      {error ? (
        <div className="break-words rounded-md border border-zinc-400 bg-white px-3 py-2 text-xs text-zinc-950">
          {error}
        </div>
      ) : null}
      <dl className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
        <div>
          <dt>Backend</dt>
          <dd className="mt-1 truncate font-medium text-zinc-950">{backend.message}</dd>
        </div>
        <div>
          <dt>Runtime</dt>
          <dd className="mt-1 font-medium text-zinc-950">Node {runtime.node}</dd>
        </div>
      </dl>
    </aside>
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
              className="mt-4 max-w-3xl rounded-md border border-zinc-400 bg-zinc-50 px-3 py-2 text-sm text-zinc-950"
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
