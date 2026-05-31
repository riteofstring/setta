import type { WorkspaceSession, WorkspaceSummary } from "@generated/backend";
import type { DesktopPlatform } from "@shared/types";
import {
  FolderOpen,
  Maximize2,
  MessageSquareText,
  Minimize2,
  PanelBottomOpen,
  PanelLeftOpen,
  PanelRightOpen,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";

import { ChatPanel, useChatViewState } from "./components/chat-panel";
import { EditorPicker } from "./components/editor-picker";
import { PixiWorkspacePrototype } from "./components/pixi-workspace-prototype";
import { ResizableBottomPane, ResizablePane } from "./components/resizable-pane";
import { WorkspacePanePanel, useWorkspacePaneState } from "./components/workspace-pane";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { cn } from "./lib/utils";
import {
  type WorkspaceOperationKind,
  type WorkspaceOperation,
  type WorkspaceStatus,
  useWorkspaceStore,
} from "./stores/workspace-store";
import { useChatStore } from "./stores/chat-store";

export function App() {
  const flags = window.setta.app.flags;
  if (flags.pixiWorkspacePrototype) {
    return <PixiWorkspacePrototype debugEnabled={flags.pixiWorkspaceDebug} />;
  }
  return <AppShell />;
}

function AppShell() {
  const workspace = useWorkspaceViewState();
  const panes = useWorkspacePaneState();
  const platform = window.setta.app.platform;
  useBackendResyncStatus();
  useSelectedWorkspaceChatSync(workspace.selectedWorkspace?.id ?? null);
  const [maximizedPane, setMaximizedPane] = useState<MaximizedPane>(null);
  const [projectPaneWidth, setProjectPaneWidth] = useState(220);
  const [chatPaneWidth, setChatPaneWidth] = useState(360);
  const [bottomPaneHeight, setBottomPaneHeight] = useState(288);
  const [projectPaneOpen, setProjectPaneOpen] = useState(true);
  const [chatPaneOpen, setChatPaneOpen] = useState(true);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const openChatSearch = useCallback(() => {
    setChatPaneOpen(true);
    setChatSearchOpen(true);
  }, []);
  const openSettingsPane = useCallback(() => {
    panes.createTab("right", "settings");
    setMaximizedPane(null);
  }, [panes]);
  const visibility = paneVisibility({
    bottomPaneOpen: panes.bottom.open,
    chatPaneOpen,
    maximizedPane,
    projectPaneOpen,
    rightPaneOpen: panes.right.open,
  });
  const maximizeTarget = topBarMaximizeTarget(visibility, maximizedPane);
  const toggleMaximizedPane = useCallback(
    (pane: NonNullable<MaximizedPane>) => {
      setProjectPaneOpen(true);
      if (pane === "chat") {
        setChatPaneOpen(true);
      }
      if (pane === "right") {
        panes.setPaneOpen("right", true);
      }
      if (pane === "bottom") {
        panes.setPaneOpen("bottom", true);
      }
      setMaximizedPane((current) => (current === pane ? null : pane));
    },
    [panes],
  );
  useEffect(() => {
    return window.setta.chat.onEvent((event) => {
      useChatStore.getState().handleEvent(event);
    });
  }, []);

  useEffect(() => {
    if (
      isMaximizedPaneOpen(maximizedPane, {
        bottom: panes.bottom.open,
        chat: chatPaneOpen,
        right: panes.right.open,
      })
    ) {
      return;
    }
    setMaximizedPane(null);
  }, [chatPaneOpen, maximizedPane, panes.bottom.open, panes.right.open]);

  return (
    <div className="relative h-screen min-h-0 overflow-hidden bg-zinc-900 text-zinc-950">
      <AppChromeControls
        bottomPaneOpen={panes.bottom.open}
        chatPaneOpen={chatPaneOpen}
        maximizedPane={maximizedPane}
        maximizeTarget={maximizeTarget}
        openChatSearch={openChatSearch}
        platform={platform}
        projectPaneOpen={projectPaneOpen}
        rightPaneOpen={panes.right.open}
        selectedWorkspace={workspace.selectedWorkspace}
        setBottomPaneOpen={(open) => panes.setPaneOpen("bottom", open)}
        setChatPaneOpen={setChatPaneOpen}
        setProjectPaneOpen={(open) => {
          if (!open) {
            setMaximizedPane(null);
          }
          setProjectPaneOpen(open);
        }}
        setRightPaneOpen={(open) => panes.setPaneOpen("right", open)}
        toggleMaximizedPane={toggleMaximizedPane}
      />
      <main className="flex h-full min-h-0 min-w-0 overflow-hidden bg-zinc-900 transition-[gap] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]">
        <ProjectPane
          chromeInsetTop={visibility.project}
          open={visibility.project}
          openSettingsPane={openSettingsPane}
          setWidth={setProjectPaneWidth}
          width={projectPaneWidth}
          workspace={workspace}
        />
        <WorkspaceArea
          bottomPaneHeight={bottomPaneHeight}
          chatPaneWidth={chatPaneWidth}
          chatSearchOpen={chatSearchOpen}
          maximizedPane={maximizedPane}
          panes={panes}
          setBottomPaneHeight={setBottomPaneHeight}
          setChatPaneWidth={setChatPaneWidth}
          setChatSearchOpen={setChatSearchOpen}
          toggleMaximizedPane={toggleMaximizedPane}
          visibility={visibility}
          workspace={workspace}
        />
      </main>
    </div>
  );
}

function useBackendResyncStatus() {
  useEffect(() => {
    return window.setta.backend.onEventStreamStatus((eventStream) => {
      if (eventStream.status === "resyncing") {
        void useChatStore.getState().resyncActiveConversation();
      }
    });
  }, []);
}

function useSelectedWorkspaceChatSync(workspaceId: string | null) {
  const loadWorkspace = useChatStore((state) => state.loadWorkspace);
  const storeWorkspaceId = useChatStore((state) => state.workspaceId);
  useLayoutEffect(() => {
    if (!workspaceId || workspaceId === storeWorkspaceId) {
      return;
    }
    void loadWorkspace(workspaceId);
  }, [loadWorkspace, storeWorkspaceId, workspaceId]);
}

type MaximizedPane = "bottom" | "chat" | "right" | null;

interface PaneVisibility {
  bottom: boolean;
  chat: boolean;
  content: boolean;
  project: boolean;
  right: boolean;
}

function paneVisibility({
  bottomPaneOpen,
  chatPaneOpen,
  maximizedPane,
  projectPaneOpen,
  rightPaneOpen,
}: {
  bottomPaneOpen: boolean;
  chatPaneOpen: boolean;
  maximizedPane: MaximizedPane;
  projectPaneOpen: boolean;
  rightPaneOpen: boolean;
}): PaneVisibility {
  const chat = panelIsVisible(chatPaneOpen, maximizedPane, "chat");
  const right = panelIsVisible(rightPaneOpen, maximizedPane, "right");
  const bottom = panelIsVisible(bottomPaneOpen, maximizedPane, "bottom");
  return {
    bottom,
    chat,
    content: contentPanelsAreVisible(maximizedPane, chat, right),
    project: projectPaneIsVisible(projectPaneOpen, maximizedPane),
    right,
  };
}

function panelIsVisible(
  open: boolean,
  maximizedPane: MaximizedPane,
  pane: NonNullable<MaximizedPane>,
) {
  return open && (maximizedPane === null || maximizedPane === pane);
}

function contentPanelsAreVisible(maximizedPane: MaximizedPane, chat: boolean, right: boolean) {
  return maximizedPane !== "bottom" && (chat || right);
}

function projectPaneIsVisible(projectPaneOpen: boolean, maximizedPane: MaximizedPane) {
  return projectPaneOpen || maximizedPane !== null;
}

function isMaximizedPaneOpen(
  maximizedPane: MaximizedPane,
  openPanes: { bottom: boolean; chat: boolean; right: boolean },
) {
  switch (maximizedPane) {
    case "bottom":
      return openPanes.bottom;
    case "chat":
      return openPanes.chat;
    case "right":
      return openPanes.right;
    case null:
      return true;
    default:
      return assertNever(maximizedPane);
  }
}

function workspaceAreaRows(maximizedPane: MaximizedPane) {
  return maximizedPane === "bottom"
    ? "grid-rows-[minmax(0,1fr)]"
    : "grid-rows-[minmax(0,1fr)_auto]";
}

function usePanePresence(open: boolean) {
  const [present, setPresent] = useState(open);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const timeoutId = window.setTimeout(() => setPresent(false), 150);
    return () => window.clearTimeout(timeoutId);
  }, [open]);

  return present;
}

function topBarMaximizeTarget(
  visibility: PaneVisibility,
  maximizedPane: MaximizedPane,
): NonNullable<MaximizedPane> | null {
  if (maximizedPane !== null) {
    return maximizedPane;
  }
  if (visibility.right) {
    return "right";
  }
  if (visibility.bottom) {
    return "bottom";
  }
  if (visibility.chat && !visibility.right) {
    return null;
  }
  return visibility.chat ? "chat" : null;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled app state: ${String(value)}`);
}

function WorkspaceArea({
  bottomPaneHeight,
  chatPaneWidth,
  chatSearchOpen,
  maximizedPane,
  panes,
  setBottomPaneHeight,
  setChatPaneWidth,
  setChatSearchOpen,
  toggleMaximizedPane,
  visibility,
  workspace,
}: {
  bottomPaneHeight: number;
  chatPaneWidth: number;
  chatSearchOpen: boolean;
  maximizedPane: MaximizedPane;
  panes: ReturnType<typeof useWorkspacePaneState>;
  setBottomPaneHeight: (height: number) => void;
  setChatPaneWidth: (width: number) => void;
  setChatSearchOpen: (open: boolean) => void;
  toggleMaximizedPane: (pane: NonNullable<MaximizedPane>) => void;
  visibility: PaneVisibility;
  workspace: WorkspaceViewState;
}) {
  const contentPresent = usePanePresence(visibility.content);
  const bottomPresent = usePanePresence(visibility.bottom);

  return (
    <div
      className={cn(
        "relative grid h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-zinc-900",
        "transition-[grid-template-rows] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
        workspaceAreaRows(maximizedPane),
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-8 z-40 h-px bg-zinc-800"
      />
      {contentPresent ? (
        <WorkspaceContentRow
          chatPaneWidth={chatPaneWidth}
          chatSearchOpen={chatSearchOpen}
          maximizedPane={maximizedPane}
          panes={panes}
          setChatPaneWidth={setChatPaneWidth}
          setChatSearchOpen={setChatSearchOpen}
          toggleMaximizedPane={toggleMaximizedPane}
          visible={visibility.content}
          visibility={visibility}
          workspace={workspace}
        />
      ) : null}
      {bottomPresent ? (
        <div
          className={cn(
            "min-h-0 transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            visibility.bottom
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-3 opacity-0",
          )}
        >
          <ResizableBottomPane
            height={bottomPaneHeight}
            label="Resize bottom pane"
            maximized={maximizedPane === "bottom"}
            minHeight={140}
            onHeightChange={setBottomPaneHeight}
          >
            <WorkspacePanePanel
              activeTabId={panes.bottom.activeTabId}
              maximized={maximizedPane === "bottom"}
              onCloseTab={(tabId) => panes.closeTab("bottom", tabId)}
              onSelectTab={(tabId) => panes.selectTab("bottom", tabId)}
              onToggleMaximize={() => toggleMaximizedPane("bottom")}
              slot="bottom"
              tabs={panes.bottom.tabs}
            />
          </ResizableBottomPane>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceContentRow({
  chatPaneWidth,
  chatSearchOpen,
  maximizedPane,
  panes,
  setChatPaneWidth,
  setChatSearchOpen,
  toggleMaximizedPane,
  visible,
  visibility,
  workspace,
}: {
  chatPaneWidth: number;
  chatSearchOpen: boolean;
  maximizedPane: MaximizedPane;
  panes: ReturnType<typeof useWorkspacePaneState>;
  setChatPaneWidth: (width: number) => void;
  setChatSearchOpen: (open: boolean) => void;
  toggleMaximizedPane: (pane: NonNullable<MaximizedPane>) => void;
  visible: boolean;
  visibility: PaneVisibility;
  workspace: WorkspaceViewState;
}) {
  const rightPresent = usePanePresence(visibility.right);
  const rightPaneTakingSpace = visibility.right || rightPresent;

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 overflow-hidden bg-zinc-900",
        "transition-[gap,opacity,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <ChatPane
        chromeInsetTop={visibility.chat}
        chatSearchOpen={chatSearchOpen}
        maximized={maximizedPane === "chat"}
        open={visibility.chat}
        rightPaneOpen={rightPaneTakingSpace}
        setChatSearchOpen={setChatSearchOpen}
        setWidth={setChatPaneWidth}
        toggleMaximize={() => toggleMaximizedPane("chat")}
        width={chatPaneWidth}
        workspace={workspace}
      />
      {rightPresent ? (
        <div
          className={cn(
            "h-full min-w-[360px] flex-1 transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            visibility.right
              ? "translate-x-0 opacity-100"
              : "pointer-events-none translate-x-4 opacity-0",
          )}
        >
          <WorkspacePanePanel
            activeTabId={panes.right.activeTabId}
            maximized={maximizedPane === "right"}
            onCloseTab={(tabId) => panes.closeTab("right", tabId)}
            onSelectTab={(tabId) => panes.selectTab("right", tabId)}
            slot="right"
            tabs={panes.right.tabs}
          />
        </div>
      ) : null}
    </div>
  );
}

type WorkspaceViewState = ReturnType<typeof useWorkspaceViewState>;

function ProjectPane({
  chromeInsetTop,
  open,
  openSettingsPane,
  setWidth,
  width,
  workspace,
}: {
  chromeInsetTop: boolean;
  open: boolean;
  openSettingsPane: () => void;
  setWidth: (width: number) => void;
  width: number;
  workspace: WorkspaceViewState;
}) {
  if (!open) {
    return null;
  }

  return (
    <ProjectPaneContent
      chromeInsetTop={chromeInsetTop}
      openSettingsPane={openSettingsPane}
      setWidth={setWidth}
      width={width}
      workspace={workspace}
    />
  );
}

function ProjectPaneContent({
  chromeInsetTop,
  openSettingsPane,
  setWidth,
  width,
  workspace,
}: {
  chromeInsetTop: boolean;
  openSettingsPane: () => void;
  setWidth: (width: number) => void;
  width: number;
  workspace: WorkspaceViewState;
}) {
  const activeRun = useChatStore((state) => state.activeRun);
  const createConversation = useChatStore((state) => state.createConversation);
  const createWorkspaceConversation = useChatStore((state) => state.createWorkspaceConversation);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const selectedConversationId = useChatStore((state) => state.selectedConversation?.id ?? "");

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
          activeRun={activeRun}
          activeWorkspaces={workspace.activeWorkspaces}
          busy={sidebarWorkspaceBusy(workspace.operation, workspace.status)}
          closeWorkspace={workspace.closeWorkspace}
          createConversation={createConversation}
          createWorkspaceConversation={createWorkspaceConversation}
          openLocalFolder={workspace.openLocalFolder}
          openWorkspacePath={workspace.openWorkspacePath}
          openSettingsPane={openSettingsPane}
          recentWorkspaces={workspace.recentWorkspaces}
          removeRecent={workspace.removeRecent}
          selectConversation={selectConversation}
          selectWorkspace={workspace.selectWorkspace}
          selectedConversationId={selectedConversationId}
          selectedWorkspaceId={workspace.selectedWorkspaceId}
          chromeInsetTop={chromeInsetTop}
          sidebarWidth={width}
        />
      </div>
    </ResizablePane>
  );
}

export function sidebarWorkspaceBusy(
  operation: WorkspaceOperation,
  status: WorkspaceStatus,
): boolean {
  return status === "loading" || (operation !== null && operation !== "selecting");
}

function ChatPane({
  chromeInsetTop,
  chatSearchOpen,
  maximized,
  open,
  rightPaneOpen,
  setChatSearchOpen,
  setWidth,
  toggleMaximize,
  width,
  workspace,
}: {
  chromeInsetTop: boolean;
  chatSearchOpen: boolean;
  maximized: boolean;
  open: boolean;
  rightPaneOpen: boolean;
  setChatSearchOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
  toggleMaximize: () => void;
  width: number;
  workspace: WorkspaceViewState;
}) {
  if (!open) {
    return null;
  }

  return (
    <ChatPaneContent
      chromeInsetTop={chromeInsetTop}
      chatSearchOpen={chatSearchOpen}
      maximized={maximized}
      rightPaneOpen={rightPaneOpen}
      setChatSearchOpen={setChatSearchOpen}
      setWidth={setWidth}
      toggleMaximize={toggleMaximize}
      width={width}
      workspace={workspace}
    />
  );
}

function ChatPaneContent({
  chromeInsetTop,
  chatSearchOpen,
  maximized,
  rightPaneOpen,
  setChatSearchOpen,
  setWidth,
  toggleMaximize,
  width,
  workspace,
}: {
  chromeInsetTop: boolean;
  chatSearchOpen: boolean;
  maximized: boolean;
  rightPaneOpen: boolean;
  setChatSearchOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
  toggleMaximize: () => void;
  width: number;
  workspace: WorkspaceViewState;
}) {
  const chat = useChatViewState();
  const panel = (
    <ChatPanel
      chat={chat}
      chromeInsetTop={chromeInsetTop}
      maximized={maximized}
      onToggleMaximize={toggleMaximize}
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
  maximizedPane,
  maximizeTarget,
  openChatSearch,
  platform,
  projectPaneOpen,
  rightPaneOpen,
  selectedWorkspace,
  setBottomPaneOpen,
  setChatPaneOpen,
  setProjectPaneOpen,
  setRightPaneOpen,
  toggleMaximizedPane,
}: {
  bottomPaneOpen: boolean;
  chatPaneOpen: boolean;
  maximizedPane: MaximizedPane;
  maximizeTarget: NonNullable<MaximizedPane> | null;
  openChatSearch: () => void;
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  rightPaneOpen: boolean;
  selectedWorkspace: WorkspaceSummary | null;
  setBottomPaneOpen: (open: boolean) => void;
  setChatPaneOpen: (open: boolean) => void;
  setProjectPaneOpen: (open: boolean) => void;
  setRightPaneOpen: (open: boolean) => void;
  toggleMaximizedPane: (pane: NonNullable<MaximizedPane>) => void;
}) {
  const createConversation = useChatStore((state) => state.createConversation);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!isModShortcut(event)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "f") {
        event.preventDefault();
        openChatSearch();
        return;
      }
      if (key === "n") {
        event.preventDefault();
        void createConversation();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
    };
  }, [createConversation, openChatSearch]);

  return (
    <>
      <ShellTopBar />
      <FloatingPaneControls
        bottomPaneOpen={bottomPaneOpen}
        chatPaneOpen={chatPaneOpen}
        platform={platform}
        projectPaneOpen={projectPaneOpen}
        rightPaneOpen={rightPaneOpen}
        rootPath={selectedWorkspace?.rootPath ?? ""}
        maximizedPane={maximizedPane}
        maximizeTarget={maximizeTarget}
        setBottomPaneOpen={setBottomPaneOpen}
        setChatPaneOpen={setChatPaneOpen}
        setProjectPaneOpen={setProjectPaneOpen}
        setRightPaneOpen={setRightPaneOpen}
        toggleMaximizedPane={toggleMaximizedPane}
      />
    </>
  );
}

function ShellTopBar() {
  return (
    <div
      aria-hidden="true"
      className="app-drag pointer-events-auto fixed inset-x-0 top-0 z-30 h-8 bg-transparent"
      data-testid="shell-top-bar"
    />
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
  disabled = false,
}: {
  active: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={
        active
          ? "inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-100 outline-none hover:bg-zinc-800 focus-visible:bg-zinc-800"
          : "inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 outline-none hover:bg-zinc-800 hover:text-zinc-100 focus-visible:bg-zinc-800 focus-visible:text-zinc-100"
      }
      disabled={disabled}
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
  platform,
  projectPaneOpen,
  rightPaneOpen,
  rootPath,
  maximizedPane,
  maximizeTarget,
  setBottomPaneOpen,
  setChatPaneOpen,
  setProjectPaneOpen,
  setRightPaneOpen,
  toggleMaximizedPane,
}: {
  bottomPaneOpen: boolean;
  chatPaneOpen: boolean;
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  rightPaneOpen: boolean;
  rootPath: string;
  maximizedPane: MaximizedPane;
  maximizeTarget: NonNullable<MaximizedPane> | null;
  setBottomPaneOpen: (open: boolean) => void;
  setChatPaneOpen: (open: boolean) => void;
  setProjectPaneOpen: (open: boolean) => void;
  setRightPaneOpen: (open: boolean) => void;
  toggleMaximizedPane: (pane: NonNullable<MaximizedPane>) => void;
}) {
  return (
    <div
      className={cn(
        "app-no-drag pointer-events-none fixed top-1 z-50 flex items-center gap-1 text-zinc-400",
        floatingControlsRightInsetClass(platform),
      )}
    >
      <div className="pointer-events-auto flex items-center gap-1 transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]">
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
        <TopBarMaximizeButton
          maximizedPane={maximizedPane}
          maximizeTarget={maximizeTarget}
          toggleMaximizedPane={toggleMaximizedPane}
        />
      </div>
    </div>
  );
}

function TopBarMaximizeButton({
  maximizedPane,
  maximizeTarget,
  toggleMaximizedPane,
}: {
  maximizedPane: MaximizedPane;
  maximizeTarget: NonNullable<MaximizedPane> | null;
  toggleMaximizedPane: (pane: NonNullable<MaximizedPane>) => void;
}) {
  const active = maximizeTarget !== null && maximizedPane === maximizeTarget;
  const label =
    maximizeTarget === null ? "Maximize pane" : maximizeButtonLabel(maximizeTarget, active);
  return (
    <button
      aria-hidden={maximizeTarget === null}
      aria-label={label}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-sm outline-none transition-[opacity,transform,background-color,color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
        active
          ? "text-zinc-100 hover:bg-zinc-800 focus-visible:bg-zinc-800"
          : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:bg-zinc-800 focus-visible:text-zinc-100",
        maximizeTarget === null && "pointer-events-none translate-x-1 opacity-0",
      )}
      disabled={maximizeTarget === null}
      onClick={() => {
        if (maximizeTarget !== null) {
          toggleMaximizedPane(maximizeTarget);
        }
      }}
      title={maximizeTarget === null ? undefined : label}
      type="button"
    >
      {active ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
    </button>
  );
}

function maximizeButtonLabel(pane: NonNullable<MaximizedPane>, active: boolean) {
  return `${active ? "Restore" : "Maximize"} ${paneLabel(pane)} pane`;
}

function paneLabel(pane: NonNullable<MaximizedPane>) {
  switch (pane) {
    case "bottom":
      return "bottom";
    case "chat":
      return "chat";
    case "right":
      return "right";
    default:
      return assertNever(pane);
  }
}

function floatingControlsRightInsetClass(platform: DesktopPlatform) {
  return platform === "darwin" ? "right-2" : "right-36";
}

function useWorkspaceViewState() {
  const closeWorkspace = useWorkspaceStore((state) => state.closeWorkspace);
  const error = useWorkspaceStore((state) => state.error);
  const loadSession = useWorkspaceStore((state) => state.loadSession);
  const openLocalFolder = useWorkspaceStore((state) => state.openLocalFolder);
  const openWorkspacePath = useWorkspaceStore((state) => state.openWorkspacePath);
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
    openWorkspacePath,
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
