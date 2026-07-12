import type { WorkspaceSession } from "@generated/backend";
import type { DesktopPlatform, SettaAPI } from "@shared/types";
import { PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  compactProjectPaneWidth,
  isMobileViewportWidth,
  projectPaneDefaultWidth,
  projectPaneMaxWidth,
  projectPaneMinWidth,
} from "./app-layout";
import { useAppWindowDragHandlers } from "./app-window-drag";
import { useViewportSize } from "./use-viewport-size";
import { ResizablePane } from "./components/resizable-pane";
import { SettaLogoMark } from "./components/setta-logo-mark";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import { AppShellSpeechCaptureProvider } from "./features/global-speech/app-shell-speech-capture";
import { AppShellSpeechPlaybackProvider } from "./features/global-speech/app-shell-speech-playback";
import type { MasterInputFocusHints } from "./features/global-speech/global-speech-master-submission";
import type { SpeechCaptureRequester } from "./features/global-speech/speech-capture-destination";
import { cn } from "./lib/utils";
import {
  WorkspaceLayoutArea,
  type WorkspaceSurfaceFocusRequest,
} from "./workspace-layout/WorkspaceLayoutArea";
import type { WorkspaceConversationFocusRequest } from "./workspace-layout/conversation-pane-runtime";
import { useAppearanceStore } from "./stores/appearance-store";
import { useChatStore } from "./stores/chat-store";
import { runChatBackgroundAction } from "./stores/chat-background-actions";
import {
  type ConversationPaneWorkspaceState,
  useConversationPaneStore,
} from "./stores/conversation-pane-store";
import { handleConversationProjectionEvent } from "./stores/conversation-projection-runtime";
import { resetRuntimeDerivedRendererState } from "./stores/runtime-derived-state";
import { runtimeControlsDisabled, useRuntimeStore } from "./stores/runtime-store";
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
  const masterInputFocusHints = useMasterInputFocusHints(workspace.selectedWorkspaceId);
  const platform = setta.app.platform;
  const viewport = useViewportSize();
  useAppearanceSettings();
  useBackendLifecycle(setta);
  const runtime = useRuntimeLifecycle(setta);
  useSelectedWorkspaceChatSync(workspace.selectedWorkspace?.id ?? null);
  const [projectPaneWidth, setProjectPaneWidth] = useState(projectPaneDefaultWidth);
  const [projectPaneOpen, setProjectPaneOpen] = useState(true);
  const [workspaceSurfaceFocusRequest, setWorkspaceSurfaceFocusRequest] =
    useState<WorkspaceSurfaceFocusRequest | null>(null);
  const [workspaceConversationFocusRequest, setWorkspaceConversationFocusRequest] =
    useState<WorkspaceConversationFocusRequest | null>(null);
  const [conversationPresentationError, setConversationPresentationError] = useState<string | null>(
    null,
  );
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
  const presentConversation = useCallback(
    async (workspaceId: string, conversationId: string, title: string) => {
      setConversationPresentationError(null);
      setWorkspaceConversationFocusRequest((current) => ({
        conversationId,
        requestId: (current?.requestId ?? 0) + 1,
        title,
        workspaceId,
      }));
      if (mobileViewport) {
        setProjectPaneOpen(false);
      }
    },
    [mobileViewport],
  );
  useEffect(() => {
    return setta.chat.onEvent((event) => {
      useChatStore.getState().handleEvent(event);
    });
  }, [setta]);
  useEffect(() => setta.conversations.onEvent(handleConversationProjectionEvent), [setta]);

  const shell = (speechCapture?: SpeechCaptureRequester) => (
    <div className="fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <AppChromeControls
        mobileViewport={mobileViewport}
        openSettingsPane={openSettingsPane}
        platform={platform}
        projectPaneOpen={projectPaneOpen}
        setProjectPaneOpen={setProjectPaneOpen}
      />
      <main className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
        <ProjectPane
          clearConversationPresentationError={() => setConversationPresentationError(null)}
          conversationPresentationError={conversationPresentationError}
          mobileOverlay={mobileViewport}
          open={projectPaneOpen}
          openSettingsPane={openSettingsPane}
          presentConversation={presentConversation}
          setWidth={setProjectPaneWidth}
          viewportWidth={viewport.width}
          width={effectiveProjectPaneWidth}
          runtimeUnavailable={runtime.controlsDisabled}
          workspace={workspace}
        />
        <WorkspaceLayoutArea
          focusConversationRequest={workspaceConversationFocusRequest}
          focusSurfaceRequest={workspaceSurfaceFocusRequest}
          onConversationPresentationError={setConversationPresentationError}
          onToggleProjectPane={toggleProjectPane}
          platform={platform}
          projectPaneOpen={projectPaneOpen}
          projectPaneWidth={mobileViewport || !projectPaneOpen ? 0 : effectiveProjectPaneWidth}
          speechCapture={speechCapture}
        />
      </main>
    </div>
  );
  if (!setta.workspaceNativeViews) {
    return shell();
  }
  return (
    <AppShellSpeechPlaybackProvider runtimeId={runtime.connectedRuntimeId} setta={setta}>
      {(playback) => (
        <AppShellSpeechCaptureProvider
          focusHints={masterInputFocusHints}
          onCaptureStart={playback.preemptForCapture}
          runtimeId={runtime.connectedRuntimeId}
          setta={setta}
        >
          {(speechCapture) => shell(speechCapture)}
        </AppShellSpeechCaptureProvider>
      )}
    </AppShellSpeechPlaybackProvider>
  );
}

function useMasterInputFocusHints(selectedWorkspaceId: string): MasterInputFocusHints {
  const focusedWorkspacePanes = useConversationPaneStore((state) =>
    state.workspaces.get(selectedWorkspaceId),
  );
  return masterInputFocusHints(optionalWorkspaceId(selectedWorkspaceId), focusedWorkspacePanes);
}

export function masterInputFocusHints(
  focusedWorkspaceId: string | null,
  focusedWorkspacePanes: ConversationPaneWorkspaceState | undefined,
): MasterInputFocusHints {
  if (!focusedWorkspaceId || !focusedWorkspacePanes) {
    return {
      focusedConversationId: null,
      focusedPaneId: null,
      focusedWorkspaceId,
    };
  }
  return {
    focusedConversationId: focusedWorkspacePanes.focusedConversationId,
    focusedPaneId: focusedWorkspacePanes.focusedPaneId,
    focusedWorkspaceId,
  };
}

function optionalWorkspaceId(workspaceId: string): string | null {
  if (workspaceId === "") {
    return null;
  }
  return workspaceId;
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

function useRuntimeLifecycle(setta: SettaAPI) {
  const loadRuntimes = useRuntimeStore((state) => state.load);
  const runtimeSnapshot = useRuntimeStore((state) => state.snapshot);
  const setRuntimeSnapshot = useRuntimeStore((state) => state.setSnapshot);
  const loadWorkspaceSession = useWorkspaceStore((state) => state.loadSession);
  const resetRuntimeStateKeyRef = useRef<string | null | undefined>(undefined);
  const activeConnectedRuntimeId =
    runtimeSnapshot?.connection.status === "connected" ? runtimeSnapshot.activeRuntimeId : null;

  useEffect(() => {
    void loadRuntimes();
    return setta.runtimes.onConnectionState((snapshot) => {
      setRuntimeSnapshot(snapshot);
    });
  }, [loadRuntimes, setRuntimeSnapshot, setta]);

  useEffect(() => {
    if (!runtimeSnapshot) {
      return;
    }
    const activeRuntimeId = runtimeSnapshot.activeRuntimeId;
    if (resetRuntimeStateKeyRef.current === activeRuntimeId) {
      return;
    }
    resetRuntimeStateKeyRef.current = activeRuntimeId;
    resetRuntimeDerivedRendererState();
  }, [runtimeSnapshot]);

  useEffect(() => {
    if (!activeConnectedRuntimeId) {
      return;
    }
    void loadWorkspaceSession();
  }, [activeConnectedRuntimeId, loadWorkspaceSession]);

  return {
    connectedRuntimeId: activeConnectedRuntimeId,
    controlsDisabled: runtimeControlsDisabled(runtimeSnapshot),
  };
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
  clearConversationPresentationError,
  conversationPresentationError,
  mobileOverlay,
  open,
  openSettingsPane,
  presentConversation,
  setWidth,
  viewportWidth,
  width,
  runtimeUnavailable,
  workspace,
}: {
  clearConversationPresentationError: () => void;
  conversationPresentationError: string | null;
  mobileOverlay: boolean;
  open: boolean;
  openSettingsPane: () => void;
  presentConversation: (
    workspaceId: string,
    conversationId: string,
    title: string,
  ) => Promise<void>;
  setWidth: (width: number) => void;
  viewportWidth: number;
  width: number;
  runtimeUnavailable: boolean;
  workspace: WorkspaceViewState;
}) {
  if (!open) {
    return null;
  }

  const sidebar = (
    <WorkspaceSidebar
      activeWorkspaces={workspace.activeWorkspaces}
      busy={runtimeUnavailable || sidebarWorkspaceBusy(workspace.operation, workspace.status)}
      clearConversationPresentationError={clearConversationPresentationError}
      clearWorkspaceError={workspace.clearError}
      closeWorkspace={workspace.closeWorkspace}
      conversationPresentationError={conversationPresentationError}
      openLocalFolder={workspace.openLocalFolder}
      openSettingsPane={openSettingsPane}
      openWorkspacePath={workspace.openWorkspacePath}
      presentConversation={presentConversation}
      recentWorkspaces={workspace.recentWorkspaces}
      removeRecent={workspace.removeRecent}
      selectWorkspace={workspace.selectWorkspace}
      selectedWorkspaceId={workspace.selectedWorkspaceId}
      showFooterSettings={mobileOverlay}
      showLogoHeader={mobileOverlay}
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
      className="absolute inset-y-0 left-0 z-[80]"
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
  openSettingsPane,
  platform,
  projectPaneOpen,
  setProjectPaneOpen,
}: {
  mobileViewport: boolean;
  openSettingsPane: () => void;
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  setProjectPaneOpen: Dispatch<SetStateAction<boolean>>;
}) {
  if (mobileViewport) {
    return null;
  }
  return (
    <DesktopShellTopBar
      onOpenSettings={openSettingsPane}
      platform={platform}
      projectPaneOpen={projectPaneOpen}
      setProjectPaneOpen={setProjectPaneOpen}
    />
  );
}

function DesktopShellTopBar({
  onOpenSettings,
  platform,
  projectPaneOpen,
  setProjectPaneOpen,
}: {
  onOpenSettings: () => void;
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  setProjectPaneOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const windowDragHandlers = useAppWindowDragHandlers();
  const ProjectPaneIcon = projectPaneOpen ? PanelLeftClose : PanelLeftOpen;
  const projectPaneLabel = projectPaneOpen ? "Hide project sidebar" : "Show project sidebar";
  return (
    <header
      className="setta-shell-top-bar app-drag"
      data-desktop-platform={platform}
      data-setta-shell-title-bar="true"
      data-testid="shell-top-bar"
      {...windowDragHandlers}
    >
      <div aria-hidden="true" className="setta-shell-top-bar-chrome-shield app-no-drag" />
      <div className="setta-shell-top-bar-left">
        <TooltipProvider>
          <div aria-label="Workspace controls" className="setta-shell-top-bar-controls app-no-drag">
            <ShellTopBarButton
              active={projectPaneOpen}
              label={projectPaneLabel}
              onClick={() => setProjectPaneOpen((current) => !current)}
              testId="project-sidebar-toggle"
            >
              <ProjectPaneIcon className="h-3.5 w-3.5" />
            </ShellTopBarButton>
            <ShellTopBarButton
              label="Open settings"
              onClick={onOpenSettings}
              testId="shell-settings-button"
            >
              <Settings className="h-3.5 w-3.5" />
            </ShellTopBarButton>
          </div>
        </TooltipProvider>
      </div>
      <div className="setta-shell-top-bar-right">
        <SettaLogoMark className="setta-shell-top-bar-logo" height={12} />
      </div>
    </header>
  );
}

function ShellTopBarButton({
  active,
  children,
  disabled = false,
  label,
  onClick,
  testId,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger>
        <button
          aria-label={label}
          aria-pressed={active}
          className={cn("setta-shell-top-bar-button app-no-drag", active && "is-active")}
          data-testid={testId}
          disabled={disabled}
          onClick={onClick}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function useWorkspaceViewState() {
  const clearError = useWorkspaceStore((state) => state.clearError);
  const closeWorkspace = useWorkspaceStore((state) => state.closeWorkspace);
  const error = useWorkspaceStore((state) => state.error);
  const openLocalFolder = useWorkspaceStore((state) => state.openLocalFolder);
  const openWorkspacePath = useWorkspaceStore((state) => state.openWorkspacePath);
  const operation = useWorkspaceStore((state) => state.operation);
  const removeRecent = useWorkspaceStore((state) => state.removeRecent);
  const selectWorkspace = useWorkspaceStore((state) => state.selectWorkspace);
  const session = useWorkspaceStore((state) => state.session);
  const status = useWorkspaceStore((state) => state.status);
  const selectedWorkspace = useSelectedWorkspace(session);

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
