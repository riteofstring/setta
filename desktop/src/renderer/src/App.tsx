import type { WorkspaceSession } from "@generated/backend";
import type { DesktopPlatform, SettaAPI } from "@shared/types";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";

import {
  compactProjectPaneWidth,
  isMobileViewportWidth,
  projectPaneDefaultWidth,
  projectPaneMaxWidth,
  projectPaneMinWidth,
} from "./app-layout";
import { useAppWindowDragHandlers } from "./app-window-drag";
import { useViewportSize } from "./use-viewport-size";
import { type ChatView, useChatViewState } from "./components/chat-panel";
import { ResizablePane } from "./components/resizable-pane";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import { cn } from "./lib/utils";
import {
  WorkspaceLayoutArea,
  type WorkspaceSurfaceFocusRequest,
} from "./workspace-layout/WorkspaceLayoutArea";
import { useAppearanceStore } from "./stores/appearance-store";
import { useChatStore } from "./stores/chat-store";
import { runChatBackgroundAction } from "./stores/chat-background-actions";
import {
  type WorkspaceOperation,
  type WorkspaceStatus,
  useWorkspaceStore,
} from "./stores/workspace-store";

export function App() {
  const setta = readSettaApi();
  if (!setta) {
    return <AppRuntimeContractError />;
  }
  return <SettaApp setta={setta} />;
}

function SettaApp({ setta }: { setta: SettaAPI }) {
  const workspace = useWorkspaceViewState();
  const chat = useChatViewState();
  const platform = setta.app.platform;
  const viewport = useViewportSize();
  useAppearanceSettings();
  useBackendLifecycle(setta);
  useSelectedWorkspaceChatSync(workspace.selectedWorkspace?.id ?? null);
  const [projectPaneWidth, setProjectPaneWidth] = useState(projectPaneDefaultWidth);
  const [projectPaneOpen, setProjectPaneOpen] = useState(true);
  const [workspaceSurfaceFocusRequest, setWorkspaceSurfaceFocusRequest] =
    useState<WorkspaceSurfaceFocusRequest | null>(null);
  const effectiveProjectPaneWidth = compactProjectPaneWidth(projectPaneWidth, viewport.width);
  const mobileViewport = isMobileViewportWidth(viewport.width);
  const toggleProjectPane = useCallback(() => {
    setProjectPaneOpen((current) => !current);
  }, []);
  // The mobile project pane is a full-screen overlay summoned from the bottom
  // bar, so it starts closed at mobile widths and reopens as the regular side
  // pane when the viewport widens again.
  useEffect(() => {
    setProjectPaneOpen(!mobileViewport);
  }, [mobileViewport]);
  const focusWorkspaceSurface = useCallback(
    (surfaceKind: WorkspaceSurfaceFocusRequest["surfaceKind"]) => {
      setWorkspaceSurfaceFocusRequest((current) => ({
        requestId: (current?.requestId ?? 0) + 1,
        surfaceKind,
      }));
      if (mobileViewport) {
        setProjectPaneOpen(false);
      }
    },
    [mobileViewport],
  );
  const openSettingsPane = useCallback(() => {
    focusWorkspaceSurface("settings-dom");
  }, [focusWorkspaceSurface]);
  const openWorkflowGraphPane = useCallback(() => {
    focusWorkspaceSurface("workflow-graph");
  }, [focusWorkspaceSurface]);
  const createConversation = chat.createConversation;
  const createWorkspaceConversation = chat.createWorkspaceConversation;
  const deleteConversation = chat.deleteConversation;
  const selectConversation = chat.selectConversation;
  const setConversationPinned = chat.setConversationPinned;
  const createConversationAndFocusChat = useCallback(
    async (title?: string) => {
      await createConversation(title);
      focusWorkspaceSurface("chat-dom");
    },
    [createConversation, focusWorkspaceSurface],
  );
  const createWorkspaceConversationAndFocusChat = useCallback(
    async (workspaceId: string, title?: string) => {
      await createWorkspaceConversation(workspaceId, title);
      focusWorkspaceSurface("chat-dom");
    },
    [createWorkspaceConversation, focusWorkspaceSurface],
  );
  const selectConversationAndFocusChat = useCallback(
    async (conversationId: string, workspaceId?: string) => {
      await selectConversation(conversationId, workspaceId);
      focusWorkspaceSurface("chat-dom");
    },
    [focusWorkspaceSurface, selectConversation],
  );
  useEffect(() => {
    return setta.chat.onEvent((event) => {
      useChatStore.getState().handleEvent(event);
    });
  }, [setta]);

  return (
    <div className="fixed inset-0 min-h-0 overflow-hidden bg-background text-foreground">
      <main className="flex h-full min-h-0 min-w-0 overflow-hidden bg-background">
        <ProjectPane
          chat={chat}
          chromeInsetTop={mobileViewport ? platform === "darwin" : projectPaneOpen}
          createConversation={createConversationAndFocusChat}
          createWorkspaceConversation={createWorkspaceConversationAndFocusChat}
          deleteConversation={deleteConversation}
          mobileOverlay={mobileViewport}
          open={projectPaneOpen}
          openSettingsPane={openSettingsPane}
          openWorkflowGraphPane={openWorkflowGraphPane}
          selectConversation={selectConversationAndFocusChat}
          setConversationPinned={setConversationPinned}
          setWidth={setProjectPaneWidth}
          viewportWidth={viewport.width}
          width={effectiveProjectPaneWidth}
          workspace={workspace}
        />
        <WorkspaceLayoutArea
          focusSurfaceRequest={workspaceSurfaceFocusRequest}
          onToggleProjectPane={toggleProjectPane}
          platform={platform}
          projectPaneOpen={projectPaneOpen}
        />
      </main>
      {/* Rendered after the workspace so the no-drag chrome controls follow every
          -webkit-app-region: drag surface in document order; Electron applies the
          drag/no-drag rects in that order, and a later drag rect would re-cover the
          holes these controls punch into the OS draggable region. */}
      <AppChromeControls
        mobileViewport={mobileViewport}
        platform={platform}
        projectPaneOpen={projectPaneOpen}
        projectPaneWidth={effectiveProjectPaneWidth}
        setProjectPaneOpen={setProjectPaneOpen}
      />
    </div>
  );
}

function readSettaApi(): SettaAPI | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (window as Window & { setta?: SettaAPI }).setta ?? null;
}

function AppRuntimeContractError() {
  return (
    <div className="fixed inset-0 flex min-h-0 items-center justify-center bg-background px-6 text-foreground">
      <div
        className="max-w-md rounded-lg border border-red-500/30 bg-red-950/30 p-5 shadow-2xl"
        data-testid="app-runtime-contract-error"
        role="alert"
      >
        <div className="text-sm font-semibold text-red-200">Setta preload API is unavailable.</div>
        <p className="mt-2 text-sm leading-6 text-red-100/80">
          The renderer cannot start because the required Electron contract{" "}
          <code className="rounded bg-red-950/80 px-1.5 py-0.5 text-red-100">window.setta</code> is
          missing. Start Setta through the Electron desktop shell so the preload script can install
          the production API.
        </p>
      </div>
    </div>
  );
}

function useBackendLifecycle(setta: SettaAPI) {
  useEffect(() => {
    return setta.backend.onProcessStatus((processStatus) => {
      useChatStore.getState().handleBackendProcessStatus(processStatus);
    });
  }, [setta]);

  useEffect(() => {
    return setta.backend.onEventStreamStatus((eventStream) => {
      if (eventStream.status === "resyncing") {
        runChatBackgroundAction("event-stream-resync", () =>
          useChatStore.getState().resyncActiveConversation(),
        );
      }
    });
  }, [setta]);
}

function useAppearanceSettings() {
  const loadAppearance = useAppearanceStore((state) => state.load);

  useEffect(() => {
    void loadAppearance();
  }, [loadAppearance]);
}

function useSelectedWorkspaceChatSync(workspaceId: string | null) {
  const syncWorkspaceChat = useChatStore((state) => state.syncWorkspaceChat);
  const storeWorkspaceId = useChatStore((state) => state.workspaceId);
  useLayoutEffect(() => {
    if (!workspaceId || workspaceId === storeWorkspaceId) {
      return;
    }
    runChatBackgroundAction("workspace-chat-sync", () => syncWorkspaceChat(workspaceId));
  }, [storeWorkspaceId, syncWorkspaceChat, workspaceId]);
}

type WorkspaceViewState = ReturnType<typeof useWorkspaceViewState>;

function ProjectPane({
  chat,
  chromeInsetTop,
  createConversation,
  createWorkspaceConversation,
  deleteConversation,
  mobileOverlay,
  open,
  openSettingsPane,
  openWorkflowGraphPane,
  selectConversation,
  setConversationPinned,
  setWidth,
  viewportWidth,
  width,
  workspace,
}: {
  chat: ChatView;
  chromeInsetTop: boolean;
  createConversation: ChatView["createConversation"];
  createWorkspaceConversation: ChatView["createWorkspaceConversation"];
  deleteConversation: ChatView["deleteConversation"];
  mobileOverlay: boolean;
  open: boolean;
  openSettingsPane: () => void;
  openWorkflowGraphPane: () => void;
  selectConversation: ChatView["selectConversation"];
  setConversationPinned: ChatView["setConversationPinned"];
  setWidth: (width: number) => void;
  viewportWidth: number;
  width: number;
  workspace: WorkspaceViewState;
}) {
  if (!open) {
    return null;
  }

  const sidebar = (
    <WorkspaceSidebar
      activeRun={chat.activeRun}
      activeWorkspaces={workspace.activeWorkspaces}
      busy={sidebarWorkspaceBusy(workspace.operation, workspace.status)}
      chromeInsetTop={chromeInsetTop}
      clearWorkspaceError={workspace.clearError}
      closeWorkspace={workspace.closeWorkspace}
      createConversation={createConversation}
      createWorkspaceConversation={createWorkspaceConversation}
      deleteConversation={deleteConversation}
      openLocalFolder={workspace.openLocalFolder}
      openSettingsPane={openSettingsPane}
      openWorkflowGraphPane={openWorkflowGraphPane}
      openWorkspacePath={workspace.openWorkspacePath}
      recentWorkspaces={workspace.recentWorkspaces}
      removeRecent={workspace.removeRecent}
      selectConversation={selectConversation}
      selectWorkspace={workspace.selectWorkspace}
      setConversationPinned={setConversationPinned}
      selectedConversationId={chat.selectedConversation?.id ?? ""}
      selectedWorkspaceId={workspace.selectedWorkspaceId}
      sidebarWidth={mobileOverlay ? viewportWidth : width}
      workspaceError={workspace.error}
    />
  );

  if (mobileOverlay) {
    // Full-screen project pane summoned from the workspace bottom bar; it
    // stops above the bar so the toggle stays reachable to dismiss it.
    return (
      <div
        className="fixed inset-x-0 top-0 z-[90] bg-background"
        data-testid="mobile-project-pane"
        style={{ bottom: "var(--workspace-mobile-bar-height)" }}
      >
        {sidebar}
      </div>
    );
  }

  return (
    <ResizablePane
      label="Resize project sidebar"
      maxWidth={projectPaneMaxWidth}
      minWidth={projectPaneMinWidth}
      onWidthChange={setWidth}
      width={width}
    >
      <div className="h-full">{sidebar}</div>
    </ResizablePane>
  );
}

export function sidebarWorkspaceBusy(
  operation: WorkspaceOperation,
  status: WorkspaceStatus,
): boolean {
  return status === "loading" || (operation !== null && operation !== "selecting");
}

function AppChromeControls({
  mobileViewport,
  platform,
  projectPaneOpen,
  projectPaneWidth,
  setProjectPaneOpen,
}: {
  mobileViewport: boolean;
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  projectPaneWidth: number;
  setProjectPaneOpen: Dispatch<SetStateAction<boolean>>;
}) {
  // At mobile widths the top-left chrome gives way to the workspace bottom
  // control bar: the project pane becomes a full-screen overlay, so the plate
  // background, project toggle, and side-pane drag strip all disappear.
  if (mobileViewport) {
    return null;
  }
  return (
    <>
      <AppChromePlate platform={platform} />
      <ShellTopBar
        platform={platform}
        projectPaneOpen={projectPaneOpen}
        projectPaneWidth={projectPaneWidth}
      />
      <FloatingProjectPaneControl
        active={projectPaneOpen}
        platform={platform}
        setProjectPaneOpen={setProjectPaneOpen}
      />
    </>
  );
}

function AppChromePlate({ platform }: { platform: DesktopPlatform }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-[80] h-10 rounded-br-xl border-r border-b border-border/45 bg-background/72 shadow-[0_10px_28px_color-mix(in_oklch,black_24%,transparent)] backdrop-blur-md"
      data-testid="shell-chrome-plate"
      style={{ width: appChromePlateWidth(platform) }}
    >
      <div
        className="app-no-drag pointer-events-auto absolute top-0 left-0 h-10"
        style={{ width: appChromeHitShieldWidth(platform) }}
      />
    </div>
  );
}

function FloatingProjectPaneControl({
  active,
  platform,
  setProjectPaneOpen,
}: {
  active: boolean;
  platform: DesktopPlatform;
  setProjectPaneOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const Icon = active ? PanelLeftClose : PanelLeftOpen;
  return (
    <div
      className={cn(
        "app-no-drag pointer-events-auto fixed top-[14px] z-[100] text-muted-foreground",
        floatingProjectControlLeftInsetClass(platform),
      )}
    >
      <ShellPaneToggle
        active={active}
        label={active ? "Hide project sidebar" : "Show project sidebar"}
        onClick={() => setProjectPaneOpen((current) => !current)}
      >
        <Icon className="h-3.5 w-3.5" />
      </ShellPaneToggle>
    </div>
  );
}

function ShellTopBar({
  platform,
  projectPaneOpen,
  projectPaneWidth,
}: {
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  projectPaneWidth: number;
}) {
  const windowDragHandlers = useAppWindowDragHandlers();
  if (!projectPaneOpen) {
    return null;
  }
  const left = shellTopBarLeftInset(platform);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-auto fixed top-0 z-30 h-10 bg-transparent"
      data-setta-shell-title-bar="true"
      data-testid="shell-top-bar"
      style={{ left, width: Math.max(0, projectPaneWidth - left) }}
      {...windowDragHandlers}
    />
  );
}

function ShellPaneToggle({
  active,
  children,
  disabled = false,
  label,
  onClick,
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
          ? "app-no-drag inline-flex h-[22px] w-[22px] items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent/80 focus-visible:bg-accent/80"
          : "app-no-drag inline-flex h-[22px] w-[22px] items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent/80 hover:text-muted-foreground focus-visible:bg-accent/80 focus-visible:text-muted-foreground"
      }
      data-testid="project-sidebar-toggle"
      disabled={disabled}
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

// The toggle + workspace toolbar cluster (22px toggle, 2px gap, 46px toolbar)
// is right-justified inside the chrome plate with the same 7px end inset the
// pane action strips use: plate width - 7 - 70.
function floatingProjectControlLeftInsetClass(platform: DesktopPlatform) {
  return platform === "darwin" ? "left-[109px]" : "left-[35px]";
}

function shellTopBarLeftInset(platform: DesktopPlatform) {
  return platform === "darwin" ? 86 : 0;
}

function appChromePlateWidth(platform: DesktopPlatform) {
  return platform === "darwin" ? 186 : 112;
}

function appChromeHitShieldWidth(platform: DesktopPlatform) {
  return platform === "darwin" ? 82 : 0;
}

function useWorkspaceViewState() {
  const clearError = useWorkspaceStore((state) => state.clearError);
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
    clearError,
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
