import type { WorkspaceSession, WorkspaceSummary } from "@generated/backend";
import {
  ChevronDown,
  FileText,
  FolderOpen,
  GitBranch,
  Globe2,
  MessageSquareText,
  PanelBottomOpen,
  PanelLeftOpen,
  PanelRightOpen,
  Search,
  Settings,
  Terminal,
  X,
} from "lucide-react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorkspaceGitInfo } from "@shared/types";
import settaLogo from "../../../img/logo/logo.svg";
import { ChatPanel, type ChatView, useChatViewState } from "./components/chat-panel";
import { EditorPicker } from "./components/editor-picker";
import { SettingsPanel } from "./components/settings-panel";
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

type PaneSlot = "bottom" | "right";
type WorkspacePaneKind = "browser" | "file" | "settings" | "terminal";

export interface WorkspacePaneTab {
  id: string;
  kind: WorkspacePaneKind;
  title: string;
}

interface WorkspacePaneState {
  activeTabId: string;
  open: boolean;
  tabs: WorkspacePaneTab[];
}

export function App() {
  const workspace = useWorkspaceViewState();
  const chat = useChatViewState(workspace.selectedWorkspace?.id ?? null);
  const panes = useWorkspacePaneState();
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

  useEffect(() => {
    return window.setta.chat.onEvent((event) => {
      useChatStore.getState().handleEvent(event);
    });
  }, []);

  return (
    <div className="relative h-screen min-h-0 overflow-hidden bg-zinc-900 text-zinc-950">
      <AppMenuBar
        bottomPaneOpen={panes.bottom.open}
        chatPaneOpen={chatPaneOpen}
        commandPaletteOpen={commandPaletteOpen}
        createConversation={chat.createConversation}
        openChatSearch={openChatSearch}
        openSearchPalette={openSearchPalette}
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
            chat={chat}
            open={projectPaneOpen}
            openSearchPalette={openSearchPalette}
            setWidth={setProjectPaneWidth}
            width={projectPaneWidth}
            workspace={workspace}
          />
          <ChatPane
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
  chat,
  open,
  openSearchPalette,
  setWidth,
  width,
  workspace,
}: {
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
      <div className="h-full border-r border-zinc-800/80">
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
        />
      </div>
    </ResizablePane>
  );
}

function ChatPane({
  chat,
  chatSearchOpen,
  open,
  rightPaneOpen,
  setChatSearchOpen,
  setWidth,
  width,
  workspace,
}: {
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

function AppMenuBar({
  bottomPaneOpen,
  chatPaneOpen,
  commandPaletteOpen,
  createConversation,
  openChatSearch,
  openSearchPalette,
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
    <header className="app-drag fixed top-0 right-0 left-0 z-50 grid h-8 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center bg-zinc-900/95 py-0 pr-2 pl-20 text-zinc-100">
      <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center">
        <img
          alt="Setta"
          className="h-3 w-auto max-w-12 shrink-0 grayscale brightness-0 invert"
          src={settaLogo}
        />
      </div>
      <div className="flex min-w-0 items-center">
        <div className="app-no-drag flex items-center gap-1">
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
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-end gap-2 text-xs text-zinc-400">
        <ShellWorkspaceControls selectedWorkspace={selectedWorkspace} />
        <div className="app-no-drag flex items-center gap-1">
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
      <CommandPalette onOpenChange={setCommandPaletteOpen} open={commandPaletteOpen} />
      <SearchPalette onOpenChange={setSearchPaletteOpen} open={searchPaletteOpen} />
    </header>
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
          ? "inline-flex h-6 w-6 items-center justify-center rounded text-zinc-100 hover:bg-zinc-800"
          : "inline-flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
      }
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

type WorkspaceGitState =
  | { status: "idle" }
  | { status: "loading" }
  | { info: WorkspaceGitInfo; status: "ready" }
  | { message: string; status: "error" };

function ShellWorkspaceControls({
  selectedWorkspace,
}: {
  selectedWorkspace: WorkspaceSummary | null;
}) {
  const git = useWorkspaceGitInfo(selectedWorkspace?.rootPath ?? null);
  const branch = branchDropdown(git);
  const worktree = worktreeDropdown(git, selectedWorkspace);

  return (
    <div className="app-no-drag flex min-w-0 items-center justify-end gap-1">
      <EditorPicker rootPath={selectedWorkspace?.rootPath ?? ""} />
      <ShellDropdownButton
        disabled={!selectedWorkspace}
        icon={<GitBranch className="h-3.5 w-3.5" />}
        items={branch.items}
        label={branch.label}
      />
      <ShellDropdownButton
        disabled={!selectedWorkspace}
        icon={<FolderOpen className="h-3.5 w-3.5" />}
        items={worktree.items}
        label={worktree.label}
      />
    </div>
  );
}

function branchDropdown(git: WorkspaceGitState) {
  if (git.status === "ready") {
    return {
      items: [
        { label: "Branch", value: git.info.branchName },
        { label: "Commit", value: git.info.commitShort },
      ],
      label: git.info.branchName,
    };
  }
  return {
    items: [
      {
        label: git.status === "loading" ? "Reading git metadata" : "Git unavailable",
        value: git.status === "error" ? git.message : "",
      },
    ],
    label: git.status === "loading" ? "Branch" : "No branch",
  };
}

function worktreeDropdown(git: WorkspaceGitState, selectedWorkspace: WorkspaceSummary | null) {
  const fallbackLabel = selectedWorkspace?.displayName ?? "No worktree";
  const label = git.status === "ready" ? git.info.worktreeName : fallbackLabel;
  return {
    items: [
      { label: "Worktree", value: label },
      {
        label: "Path",
        value: git.status === "ready" ? git.info.worktreeRoot : (selectedWorkspace?.rootPath ?? ""),
      },
    ],
    label,
  };
}

function ShellDropdownButton({
  disabled = false,
  icon,
  items,
  label,
}: {
  disabled?: boolean;
  icon: ReactNode;
  items: { label: string; value: string }[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnPointerDown = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-6 max-w-36 min-w-0 items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-2 text-[11px] text-zinc-300 hover:bg-zinc-700 hover:text-white disabled:pointer-events-none disabled:opacity-40"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {icon}
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" />
      </button>
      {open ? (
        <div
          className="absolute top-full right-0 z-50 mt-1 grid min-w-56 gap-1 rounded-md border border-zinc-700 bg-zinc-950 p-1 text-xs text-zinc-100 shadow-xl"
          role="menu"
        >
          {items.map((item) => (
            <div className="grid gap-0.5 rounded px-2 py-1.5" key={item.label} role="menuitem">
              <span className="text-[10px] tracking-wide text-zinc-500 uppercase">
                {item.label}
              </span>
              <span className="max-w-80 truncate text-zinc-200">{item.value || "Unavailable"}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function useWorkspaceGitInfo(rootPath: string | null): WorkspaceGitState {
  const [state, setState] = useState<WorkspaceGitState>({ status: "idle" });

  useEffect(() => {
    if (!rootPath) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    void window.setta.app
      .workspaceGitInfo(rootPath)
      .then((info) => {
        if (!cancelled) {
          setState({ info, status: "ready" });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            message: error instanceof Error ? error.message : "Unable to read git metadata",
            status: "error",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  return state;
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
            placeholder="Run a command"
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
      className="app-no-drag fixed inset-0 z-50 bg-black/35 px-4 pt-16"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
      role="presentation"
    >
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-md border border-zinc-700 bg-zinc-950 text-zinc-100 shadow-2xl">
        <label className="flex h-11 items-center gap-2 px-3">
          <Search className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          <Input
            className="h-9 border-0 bg-transparent px-0 shadow-none placeholder:text-zinc-600 focus-visible:border-0"
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

function useWorkspacePaneState() {
  const tabCounter = useRef(0);
  const [right, setRight] = useState<WorkspacePaneState>(emptyPaneState);
  const [bottom, setBottom] = useState<WorkspacePaneState>(emptyPaneState);

  const setPaneOpen = useCallback((slot: PaneSlot, open: boolean) => {
    const setPane = slot === "right" ? setRight : setBottom;
    setPane((pane) => ({ ...pane, open }));
  }, []);

  const createTab = useCallback((slot: PaneSlot, kind: WorkspacePaneKind) => {
    const setPane = slot === "right" ? setRight : setBottom;
    setPane((pane) => {
      tabCounter.current += 1;
      const tab = createWorkspacePaneTab(kind, tabCounter.current, pane.tabs);
      return {
        activeTabId: tab.id,
        open: true,
        tabs: [...pane.tabs, tab],
      };
    });
  }, []);

  const selectTab = useCallback((slot: PaneSlot, tabId: string) => {
    const setPane = slot === "right" ? setRight : setBottom;
    setPane((pane) => ({ ...pane, activeTabId: tabId }));
  }, []);

  const closeTab = useCallback((slot: PaneSlot, tabId: string) => {
    const setPane = slot === "right" ? setRight : setBottom;
    setPane((pane) => closeWorkspacePaneTab(pane, tabId));
  }, []);

  return {
    bottom,
    closeTab,
    createTab,
    right,
    selectTab,
    setPaneOpen,
  };
}

const emptyPaneState: WorkspacePaneState = {
  activeTabId: "",
  open: false,
  tabs: [],
};

const workspacePaneLabels = {
  browser: "Browser",
  file: "Open file",
  settings: "Settings",
  terminal: "Terminal",
} satisfies Record<WorkspacePaneKind, string>;

const workspacePaneActions = [
  "terminal",
  "browser",
  "file",
  "settings",
] satisfies WorkspacePaneKind[];

function createWorkspacePaneTab(
  kind: WorkspacePaneKind,
  idIndex: number,
  tabs: WorkspacePaneTab[],
): WorkspacePaneTab {
  const label = workspacePaneLabels[kind];
  const kindCount = tabs.filter((tab) => tab.kind === kind).length + 1;
  return {
    id: `pane_${kind}_${idIndex}`,
    kind,
    title: kindCount === 1 ? label : `${label} ${kindCount}`,
  };
}

function closeWorkspacePaneTab(pane: WorkspacePaneState, tabId: string): WorkspacePaneState {
  const closingIndex = pane.tabs.findIndex((tab) => tab.id === tabId);
  if (closingIndex === -1) {
    return pane;
  }
  const tabs = pane.tabs.filter((tab) => tab.id !== tabId);
  const activeTabId =
    pane.activeTabId === tabId ? (tabs[Math.max(0, closingIndex - 1)]?.id ?? "") : pane.activeTabId;
  return {
    ...pane,
    activeTabId,
    tabs,
  };
}

export function WorkspacePanePanel({
  activeTabId,
  onCloseTab,
  onCreateTab,
  onSelectTab,
  slot,
  tabs,
}: {
  activeTabId: string;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (kind: WorkspacePaneKind) => void;
  onSelectTab: (tabId: string) => void;
  slot: PaneSlot;
  tabs: WorkspacePaneTab[];
}) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const paneLabel = slot === "right" ? "Right pane" : "Bottom pane";
  return (
    <section
      aria-label={paneLabel}
      className={
        slot === "right"
          ? "flex h-full min-h-0 flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-100"
          : "flex h-72 min-h-0 flex-col border-t border-zinc-800 bg-zinc-950 text-zinc-100"
      }
      data-testid={`${slot}-workspace-pane`}
    >
      <header className="app-no-drag flex h-9 shrink-0 items-center gap-1 border-b border-zinc-800 px-2">
        {tabs.length > 0 ? (
          <nav className="flex min-w-0 flex-1 items-center gap-1" aria-label={`${paneLabel} tabs`}>
            {tabs.map((tab) => (
              <WorkspacePaneTabButton
                active={tab.id === activeTabId}
                key={tab.id}
                onClose={() => onCloseTab(tab.id)}
                onSelect={() => onSelectTab(tab.id)}
                tab={tab}
              />
            ))}
          </nav>
        ) : (
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{paneLabel}</span>
        )}
        {tabs.length > 0 ? (
          <div className="flex items-center gap-1">
            {workspacePaneActions.map((kind) => (
              <WorkspacePaneActionButton
                key={kind}
                kind={kind}
                onClick={() => onCreateTab(kind)}
                showLabel={false}
              />
            ))}
          </div>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab ? (
          <WorkspacePaneContent tab={activeTab} />
        ) : (
          <WorkspacePaneEmpty onCreateTab={onCreateTab} />
        )}
      </div>
    </section>
  );
}

function WorkspacePaneTabButton({
  active,
  onClose,
  onSelect,
  tab,
}: {
  active: boolean;
  onClose: () => void;
  onSelect: () => void;
  tab: WorkspacePaneTab;
}) {
  return (
    <div
      className={
        active
          ? "group flex h-7 min-w-0 max-w-40 items-center gap-1 rounded-md bg-zinc-800 px-2 text-xs text-zinc-100"
          : "group flex h-7 min-w-0 max-w-40 items-center gap-1 rounded-md px-2 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
      }
      data-testid={`workspace-pane-tab-${tab.id}`}
    >
      {workspacePaneIcon(tab.kind, "h-3.5 w-3.5 shrink-0")}
      <button className="min-w-0 truncate" onClick={onSelect} type="button">
        {tab.title}
      </button>
      <button
        aria-label={`Close ${tab.title}`}
        className="ml-1 hidden h-4 w-4 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-700 hover:text-zinc-100 group-hover:inline-flex"
        onClick={onClose}
        type="button"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function WorkspacePaneActionButton({
  kind,
  onClick,
  showLabel,
}: {
  kind: WorkspacePaneKind;
  onClick: () => void;
  showLabel: boolean;
}) {
  const label = workspacePaneLabels[kind];
  return (
    <button
      aria-label={`New ${label}`}
      className={
        showLabel
          ? "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          : "inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
      }
      onClick={onClick}
      title={`New ${label}`}
      type="button"
    >
      {workspacePaneIcon(kind, "h-3.5 w-3.5 shrink-0")}
      {showLabel ? <span>{label}</span> : null}
    </button>
  );
}

function WorkspacePaneEmpty({ onCreateTab }: { onCreateTab: (kind: WorkspacePaneKind) => void }) {
  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="flex flex-wrap justify-center gap-1">
        {workspacePaneActions.map((kind) => (
          <WorkspacePaneActionButton
            key={kind}
            kind={kind}
            onClick={() => onCreateTab(kind)}
            showLabel
          />
        ))}
      </div>
    </div>
  );
}

function WorkspacePaneContent({ tab }: { tab: WorkspacePaneTab }) {
  switch (tab.kind) {
    case "browser":
      return (
        <div className="flex h-full min-h-0 flex-col bg-zinc-900">
          <div className="flex h-8 shrink-0 items-center gap-2 border-b border-zinc-800 px-3 text-xs text-zinc-500">
            <Globe2 className="h-3.5 w-3.5" />
            <span>Browser</span>
          </div>
        </div>
      );
    case "file":
      return (
        <div className="flex h-full min-h-0 flex-col bg-zinc-900">
          <div className="flex h-8 shrink-0 items-center gap-2 border-b border-zinc-800 px-3 text-xs text-zinc-500">
            <FileText className="h-3.5 w-3.5" />
            <span>Open file</span>
          </div>
        </div>
      );
    case "settings":
      return <SettingsPanel />;
    case "terminal":
      return (
        <div className="h-full bg-zinc-950 p-3 font-mono text-xs text-zinc-500">
          <span className="text-zinc-300">$</span>
        </div>
      );
    default:
      return assertWorkspacePaneKind(tab.kind);
  }
}

function workspacePaneIcon(kind: WorkspacePaneKind, className: string) {
  switch (kind) {
    case "browser":
      return <Globe2 className={className} />;
    case "file":
      return <FileText className={className} />;
    case "settings":
      return <Settings className={className} />;
    case "terminal":
      return <Terminal className={className} />;
    default:
      return assertWorkspacePaneKind(kind);
  }
}

function assertWorkspacePaneKind(value: never): never {
  throw new Error(`Unhandled workspace pane kind: ${value}`);
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
