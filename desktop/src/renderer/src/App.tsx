import type { WorkspaceSession, WorkspaceSummary } from "@generated/backend";
import type { DesktopPlatform } from "@shared/types";
import {
  FolderOpen,
  MessageSquareText,
  PanelBottomOpen,
  PanelLeftOpen,
  PanelRightOpen,
  Search,
} from "lucide-react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChatPanel, type ChatView, useChatViewState } from "./components/chat-panel";
import { EditorPicker } from "./components/editor-picker";
import { WorkspacePanePanel, useWorkspacePaneState } from "./components/workspace-pane";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import {
  type WorkspaceOperationKind,
  type WorkspaceOperation,
  type WorkspaceStatus,
  useWorkspaceStore,
} from "./stores/workspace-store";
import { useChatStore } from "./stores/chat-store";

export function App() {
  const workspace = useWorkspaceViewState();
  const chat = useChatViewState(workspace.selectedWorkspace?.id ?? null);
  const panes = useWorkspacePaneState();
  const platform = window.setta.app.platform;
  const [projectPaneWidth, setProjectPaneWidth] = useState(220);
  const [chatPaneWidth, setChatPaneWidth] = useState(360);
  const [projectPaneOpen, setProjectPaneOpen] = useState(true);
  const [chatPaneOpen, setChatPaneOpen] = useState(true);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [searchPaletteOpen, setSearchPaletteOpen] = useState(false);
  const openChatSearch = useCallback(() => {
    setChatPaneOpen(true);
    setChatSearchOpen(true);
  }, []);
  const openSearchPalette = useCallback(() => {
    setCommandPaletteOpen(false);
    setSearchPaletteOpen(true);
  }, []);
  const chromeInsetPane = nativeChromeInsetPane(platform, {
    chat: chatPaneOpen,
    project: projectPaneOpen,
    right: panes.right.open,
  });

  useEffect(() => {
    return window.setta.chat.onEvent((event) => {
      useChatStore.getState().handleEvent(event);
    });
  }, []);

  return (
    <div className="relative h-screen min-h-0 overflow-hidden bg-zinc-900 text-zinc-950">
      <AppChromeControls
        bottomPaneOpen={panes.bottom.open}
        chatPaneOpen={chatPaneOpen}
        commandPaletteOpen={commandPaletteOpen}
        createConversation={chat.createConversation}
        openChatSearch={openChatSearch}
        openSearchPalette={openSearchPalette}
        platform={platform}
        projectPaneOpen={projectPaneOpen}
        rightPaneOpen={panes.right.open}
        searchPaletteOpen={searchPaletteOpen}
        selectedWorkspace={workspace.selectedWorkspace}
        setBottomPaneOpen={(open) => panes.setPaneOpen("bottom", open)}
        setChatPaneOpen={setChatPaneOpen}
        setCommandPaletteOpen={setCommandPaletteOpen}
        setProjectPaneOpen={setProjectPaneOpen}
        setRightPaneOpen={(open) => panes.setPaneOpen("right", open)}
        setSearchPaletteOpen={setSearchPaletteOpen}
      />
      <main className="grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-zinc-900">
        <div className="flex min-h-0 min-w-0 overflow-hidden bg-zinc-900">
          <ProjectPane
            chromeInsetTop={chromeInsetPane === "project"}
            chat={chat}
            open={projectPaneOpen}
            openSearchPalette={openSearchPalette}
            setWidth={setProjectPaneWidth}
            width={projectPaneWidth}
            workspace={workspace}
          />
          <ChatPane
            chromeInsetTop={chromeInsetPane === "chat"}
            chat={chat}
            chatSearchOpen={chatSearchOpen}
            open={chatPaneOpen}
            rightPaneOpen={panes.right.open}
            setChatSearchOpen={setChatSearchOpen}
            setWidth={setChatPaneWidth}
            width={chatPaneWidth}
            workspace={workspace}
          />
          {panes.right.open ? (
            <div className="h-full min-w-[360px] flex-1">
              <WorkspacePanePanel
                activeTabId={panes.right.activeTabId}
                chromeInsetTop={chromeInsetPane === "right"}
                onCloseTab={(tabId) => panes.closeTab("right", tabId)}
                onCreateTab={(kind) => panes.createTab("right", kind)}
                onSelectTab={(tabId) => panes.selectTab("right", tabId)}
                slot="right"
                tabs={panes.right.tabs}
              />
            </div>
          ) : null}
        </div>
        {panes.bottom.open ? (
          <WorkspacePanePanel
            activeTabId={panes.bottom.activeTabId}
            onCloseTab={(tabId) => panes.closeTab("bottom", tabId)}
            onCreateTab={(kind) => panes.createTab("bottom", kind)}
            onSelectTab={(tabId) => panes.selectTab("bottom", tabId)}
            slot="bottom"
            tabs={panes.bottom.tabs}
          />
        ) : null}
      </main>
    </div>
  );
}

type WorkspaceViewState = ReturnType<typeof useWorkspaceViewState>;

function ProjectPane({
  chromeInsetTop,
  chat,
  open,
  openSearchPalette,
  setWidth,
  width,
  workspace,
}: {
  chromeInsetTop: boolean;
  chat: ChatView;
  open: boolean;
  openSearchPalette: () => void;
  setWidth: (width: number) => void;
  width: number;
  workspace: WorkspaceViewState;
}) {
  if (!open) {
    return null;
  }

  return (
    <ResizablePane
      label="Resize project sidebar"
      maxWidth={320}
      minWidth={176}
      onWidthChange={setWidth}
      width={width}
    >
      <div className="h-full">
        <WorkspaceSidebar
          activeRun={chat.activeRun}
          activeWorkspaces={workspace.activeWorkspaces}
          busy={workspace.busy || chat.operation !== null}
          chatBusy={chat.operation !== null || chat.status === "loading"}
          closeWorkspace={workspace.closeWorkspace}
          conversations={chat.conversations}
          createConversation={chat.createConversation}
          openLocalFolder={workspace.openLocalFolder}
          openSearch={openSearchPalette}
          recentWorkspaces={workspace.recentWorkspaces}
          removeRecent={workspace.removeRecent}
          selectConversation={chat.selectConversation}
          selectWorkspace={workspace.selectWorkspace}
          selectedConversationId={chat.selectedConversation?.id ?? ""}
          selectedWorkspaceId={workspace.selectedWorkspaceId}
          chromeInsetTop={chromeInsetTop}
          sidebarWidth={width}
        />
      </div>
    </ResizablePane>
  );
}

function ChatPane({
  chromeInsetTop,
  chat,
  chatSearchOpen,
  open,
  rightPaneOpen,
  setChatSearchOpen,
  setWidth,
  width,
  workspace,
}: {
  chromeInsetTop: boolean;
  chat: ChatView;
  chatSearchOpen: boolean;
  open: boolean;
  rightPaneOpen: boolean;
  setChatSearchOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
  width: number;
  workspace: WorkspaceViewState;
}) {
  if (!open) {
    return null;
  }

  const panel = (
    <ChatPanel
      chat={chat}
      chromeInsetTop={chromeInsetTop}
      searchOpen={chatSearchOpen}
      setSearchOpen={setChatSearchOpen}
      workspace={workspace.selectedWorkspace}
    />
  );
  if (!rightPaneOpen) {
    return <div className="h-full min-h-0 min-w-0 flex-1">{panel}</div>;
  }

  return (
    <ResizablePane
      label="Resize chat"
      maxWidth={560}
      minWidth={300}
      onWidthChange={setWidth}
      width={width}
    >
      {panel}
    </ResizablePane>
  );
}

function AppChromeControls({
  bottomPaneOpen,
  chatPaneOpen,
  commandPaletteOpen,
  createConversation,
  openChatSearch,
  openSearchPalette,
  platform,
  projectPaneOpen,
  rightPaneOpen,
  searchPaletteOpen,
  selectedWorkspace,
  setBottomPaneOpen,
  setChatPaneOpen,
  setCommandPaletteOpen,
  setProjectPaneOpen,
  setRightPaneOpen,
  setSearchPaletteOpen,
}: {
  bottomPaneOpen: boolean;
  chatPaneOpen: boolean;
  commandPaletteOpen: boolean;
  createConversation: (title?: string) => Promise<void>;
  openChatSearch: () => void;
  openSearchPalette: () => void;
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  rightPaneOpen: boolean;
  searchPaletteOpen: boolean;
  selectedWorkspace: WorkspaceSummary | null;
  setBottomPaneOpen: (open: boolean) => void;
  setChatPaneOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setProjectPaneOpen: (open: boolean) => void;
  setRightPaneOpen: (open: boolean) => void;
  setSearchPaletteOpen: (open: boolean) => void;
}) {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!isModShortcut(event)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setSearchPaletteOpen(false);
        setCommandPaletteOpen(true);
        return;
      }
      if (key === "g") {
        event.preventDefault();
        openSearchPalette();
        return;
      }
      if (key === "f") {
        event.preventDefault();
        setCommandPaletteOpen(false);
        setSearchPaletteOpen(false);
        openChatSearch();
        return;
      }
      if (key === "n") {
        event.preventDefault();
        setCommandPaletteOpen(false);
        setSearchPaletteOpen(false);
        void createConversation();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
    };
  }, [
    createConversation,
    openChatSearch,
    openSearchPalette,
    setCommandPaletteOpen,
    setSearchPaletteOpen,
  ]);

  return (
    <>
      <FloatingPaneControls
        bottomPaneOpen={bottomPaneOpen}
        chatPaneOpen={chatPaneOpen}
        projectPaneOpen={projectPaneOpen}
        rightPaneOpen={rightPaneOpen}
        rootPath={selectedWorkspace?.rootPath ?? ""}
        setBottomPaneOpen={setBottomPaneOpen}
        setChatPaneOpen={setChatPaneOpen}
        setProjectPaneOpen={setProjectPaneOpen}
        setRightPaneOpen={setRightPaneOpen}
      />
      <NativeChromeGuards platform={platform} />
      <CommandPalette onOpenChange={setCommandPaletteOpen} open={commandPaletteOpen} />
      <SearchPalette onOpenChange={setSearchPaletteOpen} open={searchPaletteOpen} />
    </>
  );
}

function isModShortcut(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey;
}

function ShellPaneToggle({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={
        active
          ? "inline-flex h-6 w-6 items-center justify-center rounded-sm text-zinc-100 hover:bg-zinc-800"
          : "inline-flex h-6 w-6 items-center justify-center rounded-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
      }
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function FloatingPaneControls({
  bottomPaneOpen,
  chatPaneOpen,
  projectPaneOpen,
  rightPaneOpen,
  rootPath,
  setBottomPaneOpen,
  setChatPaneOpen,
  setProjectPaneOpen,
  setRightPaneOpen,
}: {
  bottomPaneOpen: boolean;
  chatPaneOpen: boolean;
  projectPaneOpen: boolean;
  rightPaneOpen: boolean;
  rootPath: string;
  setBottomPaneOpen: (open: boolean) => void;
  setChatPaneOpen: (open: boolean) => void;
  setProjectPaneOpen: (open: boolean) => void;
  setRightPaneOpen: (open: boolean) => void;
}) {
  return (
    <div className="app-no-drag pointer-events-none fixed top-1 right-2 z-50 flex items-center gap-1 text-zinc-400">
      <div className="pointer-events-auto flex items-center gap-1">
        <EditorPicker rootPath={rootPath} />
        <ShellPaneToggle
          active={projectPaneOpen}
          label={projectPaneOpen ? "Hide project sidebar" : "Show project sidebar"}
          onClick={() => setProjectPaneOpen(!projectPaneOpen)}
        >
          <PanelLeftOpen className="h-3.5 w-3.5" />
        </ShellPaneToggle>
        <ShellPaneToggle
          active={chatPaneOpen}
          label={chatPaneOpen ? "Hide chat pane" : "Show chat pane"}
          onClick={() => setChatPaneOpen(!chatPaneOpen)}
        >
          <MessageSquareText className="h-3.5 w-3.5" />
        </ShellPaneToggle>
        <ShellPaneToggle
          active={bottomPaneOpen}
          label={bottomPaneOpen ? "Hide bottom pane" : "Show bottom pane"}
          onClick={() => setBottomPaneOpen(!bottomPaneOpen)}
        >
          <PanelBottomOpen className="h-3.5 w-3.5" />
        </ShellPaneToggle>
        <ShellPaneToggle
          active={rightPaneOpen}
          label={rightPaneOpen ? "Hide right pane" : "Show right pane"}
          onClick={() => setRightPaneOpen(!rightPaneOpen)}
        >
          <PanelRightOpen className="h-3.5 w-3.5" />
        </ShellPaneToggle>
      </div>
    </div>
  );
}

function NativeChromeGuards({ platform }: { platform: DesktopPlatform }) {
  if (platform !== "darwin") {
    return null;
  }
  return (
    <div
      aria-hidden="true"
      className="app-drag fixed top-0 right-0 z-40 h-8"
      data-testid="macos-window-drag-strip"
      style={{ left: macOsTrafficLightSafeWidth }}
    />
  );
}

type ChromeInsetPane = "chat" | "project" | "right";

const macOsTrafficLightSafeWidth = 92;

function nativeChromeInsetPane(
  platform: DesktopPlatform,
  visiblePanes: Record<ChromeInsetPane, boolean>,
): ChromeInsetPane | null {
  if (platform !== "darwin") {
    return null;
  }
  if (visiblePanes.project) {
    return "project";
  }
  if (visiblePanes.chat) {
    return "chat";
  }
  if (visiblePanes.right) {
    return "right";
  }
  return null;
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
      className="app-no-drag fixed inset-0 z-50 bg-black/35 px-3 pt-10"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
      role="presentation"
    >
      <div className="mx-auto w-full max-w-lg overflow-hidden rounded-sm border border-zinc-700 bg-zinc-950 text-zinc-100 shadow-xl">
        <label className="flex h-8 items-center gap-1.5 border-b border-zinc-800 px-2">
          <Search className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
          <Input
            className="h-7 border-0 bg-transparent px-0 text-xs shadow-none placeholder:text-zinc-600 focus-visible:border-0"
            placeholder="Run a command"
            ref={inputRef}
          />
        </label>
        <div className="p-1">
          {["Open Project", "Switch Workspace", "Search Chat", "Open Settings"].map((command) => (
            <button
              className="flex h-7 w-full items-center justify-between rounded-sm px-2 text-left text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-white"
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

function SearchPalette({
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
      className="app-no-drag fixed inset-0 z-50 bg-black/35 px-3 pt-10"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
      role="presentation"
    >
      <div className="mx-auto w-full max-w-lg overflow-hidden rounded-sm border border-zinc-700 bg-zinc-950 text-zinc-100 shadow-xl">
        <label className="flex h-8 items-center gap-1.5 px-2">
          <Search className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
          <Input
            className="h-7 border-0 bg-transparent px-0 text-xs shadow-none placeholder:text-zinc-600 focus-visible:border-0"
            placeholder="Search chats, projects, files"
            ref={inputRef}
          />
        </label>
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
    (event: ReactPointerEvent<HTMLDivElement>) => {
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
    <div id="workspace" className="border-b border-zinc-200 bg-white p-2">
      <div className="flex h-full items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-zinc-950">Workspace</h2>
            {status === "loading" ? <Badge variant="neutral">Loading</Badge> : null}
            {operation ? <Badge variant="neutral">{operationLabel(operation)}</Badge> : null}
          </div>
          {selectedWorkspace ? (
            <div className="mt-3 min-w-0">
              <div className="truncate text-xs font-semibold">{selectedWorkspace.displayName}</div>
              <div
                className="mt-1 truncate text-xs text-zinc-500"
                data-testid="selected-workspace-path"
              >
                {selectedWorkspace.rootPath}
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <div className="text-xs font-semibold">No workspace open</div>
              <Button
                className="mt-2 h-7 rounded-sm px-2 text-xs"
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
              className="mt-2 max-w-3xl rounded-sm border border-zinc-400 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-950"
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
