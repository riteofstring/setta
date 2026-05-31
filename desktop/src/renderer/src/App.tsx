import type { WorkspaceSession, WorkspaceSummary } from "@generated/backend";
import {
  ChevronDown,
  FolderOpen,
  GitBranch,
  Globe2,
  MessageSquareText,
  PanelLeftOpen,
  PanelTop,
  PanelRightOpen,
  Search,
  Settings,
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

type RightView = "browser" | "canvas" | "git" | "settings";

export function App() {
  const workspace = useWorkspaceViewState();
  const chat = useChatViewState(workspace.selectedWorkspace?.id ?? null);
  const [projectPaneWidth, setProjectPaneWidth] = useState(220);
  const [chatPaneWidth, setChatPaneWidth] = useState(360);
  const [projectPaneOpen, setProjectPaneOpen] = useState(true);
  const [chatPaneOpen, setChatPaneOpen] = useState(true);
  const [rightView, setRightView] = useState<RightView | null>("canvas");

  useEffect(() => {
    return window.setta.chat.onEvent((event) => {
      useChatStore.getState().handleEvent(event);
    });
  }, []);

  return (
    <div className="relative h-screen min-h-0 overflow-hidden bg-zinc-900 text-zinc-950">
      <AppMenuBar
        chatPaneOpen={chatPaneOpen}
        createConversation={chat.createConversation}
        projectPaneOpen={projectPaneOpen}
        rightPaneOpen={rightView !== null}
        selectedWorkspace={workspace.selectedWorkspace}
        setChatPaneOpen={setChatPaneOpen}
        setProjectPaneOpen={setProjectPaneOpen}
        setRightPaneOpen={(open) => setRightView(open ? "canvas" : null)}
      />
      <main className="flex h-full min-h-0 min-w-0 overflow-hidden bg-zinc-900">
        <ProjectPane
          chat={chat}
          open={projectPaneOpen}
          setWidth={setProjectPaneWidth}
          width={projectPaneWidth}
          workspace={workspace}
        />
        <ChatPane
          chat={chat}
          open={chatPaneOpen}
          rightView={rightView}
          setWidth={setChatPaneWidth}
          width={chatPaneWidth}
          workspace={workspace}
        />
        <CanvasPanel activeView={rightView} onSelectView={setRightView} />
      </main>
    </div>
  );
}

type WorkspaceViewState = ReturnType<typeof useWorkspaceViewState>;

function ProjectPane({
  chat,
  open,
  setWidth,
  width,
  workspace,
}: {
  chat: ChatView;
  open: boolean;
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
  open,
  rightView,
  setWidth,
  width,
  workspace,
}: {
  chat: ChatView;
  open: boolean;
  rightView: RightView | null;
  setWidth: (width: number) => void;
  width: number;
  workspace: WorkspaceViewState;
}) {
  if (!open) {
    return null;
  }

  const panel = <ChatPanel chat={chat} workspace={workspace.selectedWorkspace} />;
  if (!rightView) {
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
  chatPaneOpen,
  createConversation,
  projectPaneOpen,
  rightPaneOpen,
  selectedWorkspace,
  setChatPaneOpen,
  setProjectPaneOpen,
  setRightPaneOpen,
}: {
  chatPaneOpen: boolean;
  createConversation: (title?: string) => Promise<void>;
  projectPaneOpen: boolean;
  rightPaneOpen: boolean;
  selectedWorkspace: WorkspaceSummary | null;
  setChatPaneOpen: (open: boolean) => void;
  setProjectPaneOpen: (open: boolean) => void;
  setRightPaneOpen: (open: boolean) => void;
}) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [searchPaletteOpen, setSearchPaletteOpen] = useState(false);

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
        setCommandPaletteOpen(false);
        setSearchPaletteOpen(true);
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
  }, [createConversation]);

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
          <ShellPaneToggle
            active={rightPaneOpen}
            label={rightPaneOpen ? "Hide workspace view" : "Show workspace view"}
            onClick={() => setRightPaneOpen(!rightPaneOpen)}
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
          </ShellPaneToggle>
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-end gap-2 text-xs text-zinc-400">
        <ShellWorkspaceControls selectedWorkspace={selectedWorkspace} />
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

function CanvasPanel({
  activeView,
  onSelectView,
}: {
  activeView: RightView | null;
  onSelectView: (view: RightView | null) => void;
}) {
  return (
    <section
      className={
        activeView ? "flex min-w-0 flex-1 bg-zinc-900" : "flex min-w-0 shrink-0 bg-zinc-900"
      }
    >
      {activeView ? (
        <div className="relative m-2 mt-10 ml-0 min-w-0 flex-1 overflow-hidden rounded-md bg-zinc-800 text-zinc-100 ring-1 ring-zinc-700/70">
          <WorkspaceView activeView={activeView} />
        </div>
      ) : null}
      <ViewTabRail activeView={activeView} onSelectView={onSelectView} />
    </section>
  );
}

function WorkspaceView({ activeView }: { activeView: RightView }) {
  switch (activeView) {
    case "canvas":
      return <CanvasPlaceholder />;
    case "git":
      return <WorkspacePlaceholder icon={<GitBranch className="h-4 w-4" />} title="Git" />;
    case "browser":
      return <WorkspacePlaceholder icon={<Globe2 className="h-4 w-4" />} title="Browser" />;
    case "settings":
      return <SettingsPanel />;
    default:
      return assertNever(activeView);
  }
}

function CanvasPlaceholder() {
  return (
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
  );
}

function WorkspacePlaceholder({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center px-8">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-400">
        {icon}
        {title}
      </div>
    </div>
  );
}

function ViewTabRail({
  activeView,
  onSelectView,
}: {
  activeView: RightView | null;
  onSelectView: (view: RightView | null) => void;
}) {
  return (
    <aside
      className="flex w-12 shrink-0 flex-col items-center gap-1 bg-zinc-900 pt-10"
      aria-label="Workspace views"
    >
      <ViewTabButton
        active={activeView === "canvas"}
        label="Canvas"
        onClick={() => onSelectView(activeView === "canvas" ? null : "canvas")}
      >
        <PanelTop className="h-4 w-4" />
      </ViewTabButton>
      <ViewTabButton
        active={activeView === "git"}
        label="Git"
        onClick={() => onSelectView(activeView === "git" ? null : "git")}
      >
        <GitBranch className="h-4 w-4" />
      </ViewTabButton>
      <ViewTabButton
        active={activeView === "settings"}
        label="Settings"
        onClick={() => onSelectView(activeView === "settings" ? null : "settings")}
      >
        <Settings className="h-4 w-4" />
      </ViewTabButton>
      <ViewTabButton
        active={activeView === "browser"}
        label="Web browser"
        onClick={() => onSelectView(activeView === "browser" ? null : "browser")}
      >
        <Globe2 className="h-4 w-4" />
      </ViewTabButton>
    </aside>
  );
}

function ViewTabButton({
  active = false,
  children,
  label,
  onClick,
}: {
  active?: boolean;
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
          ? "inline-flex h-9 w-9 items-center justify-center rounded-md bg-zinc-100 text-zinc-950"
          : "inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
      }
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
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

function assertNever(value: never): never {
  throw new Error(`Unhandled workspace view: ${value}`);
}
