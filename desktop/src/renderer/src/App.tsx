import type { WorkspaceSession } from "@generated/backend";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";

import { AppChromeControls, type MaximizedPane } from "./components/app-chrome-controls";
import { ChatPanel, useChatViewState } from "./components/chat-panel";
import { PixiWorkspacePrototype } from "./features/workspace-graph/pixi-workspace-prototype";
import { ResizableBottomPane, ResizablePane } from "./components/resizable-pane";
import { WorkspacePanePanel, useWorkspacePaneState } from "./components/workspace-pane";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import { cn } from "./lib/utils";
import {
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
