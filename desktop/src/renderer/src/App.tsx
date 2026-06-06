import type { WorkspaceSession } from "@generated/backend";
import type { DesktopPlatform, SettaAPI } from "@shared/types";
import { LayoutGrid, PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { type ChatView, useChatViewState } from "./components/chat-panel";
import { ResizablePane } from "./components/resizable-pane";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import {
  compactProjectPaneWidth,
  projectPaneDefaultWidth,
  projectPaneMaxWidth,
  projectPaneMinWidth,
} from "./app-layout";
import { cn } from "./lib/utils";
import { NiriWorkspaceArea } from "./niri-workspace/NiriWorkspaceArea";
import { useWorkspaceStore } from "./stores/workspace-store";
import { useChatStore } from "./stores/chat-store";
import { useAppearanceStore } from "./stores/appearance-store";

export function App() {
  const setta = readSettaApi();
  if (!setta) {
    return <AppRuntimeContractError />;
  }
  return <SettaApp setta={setta} />;
}

function SettaApp({ setta }: { setta: SettaAPI }) {
  const workspace = useWorkspaceViewState();
  const chat = useChatViewState(workspace.selectedWorkspace?.id ?? null);
  const platform = setta.app.platform;
  const viewport = useViewportSize();
  useAppearanceSettings();
  useBackendResyncStatus(setta);
  const [projectPaneWidth, setProjectPaneWidth] = useState(projectPaneDefaultWidth);
  const [projectPaneOpen, setProjectPaneOpen] = useState(true);
  const effectiveProjectPaneWidth = compactProjectPaneWidth(projectPaneWidth, viewport.width);
  const openSettingsPane = useCallback(() => {}, []);
  useEffect(() => {
    return setta.chat.onEvent((event) => {
      useChatStore.getState().handleEvent(event);
    });
  }, [setta]);

  return (
    <div className="fixed inset-0 min-h-0 overflow-hidden bg-background text-foreground">
      <AppChromeControls
        platform={platform}
        projectPaneOpen={projectPaneOpen}
        setProjectPaneOpen={setProjectPaneOpen}
      />
      <main className="flex h-full min-h-0 min-w-0 overflow-hidden bg-background">
        <ProjectPane
          chromeInsetTop={projectPaneOpen}
          chat={chat}
          open={projectPaneOpen}
          openSettingsPane={openSettingsPane}
          setWidth={setProjectPaneWidth}
          width={effectiveProjectPaneWidth}
          workspace={workspace}
        />
        <NiriWorkspaceArea />
      </main>
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
    <div className="fixed inset-0 flex min-h-0 items-center justify-center bg-zinc-950 px-6 text-zinc-100">
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

function useBackendResyncStatus(setta: SettaAPI) {
  useEffect(() => {
    return setta.backend.onEventStreamStatus((eventStream) => {
      if (eventStream.status === "resyncing") {
        void useChatStore.getState().resyncActiveConversation();
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

function useViewportSize() {
  const [size, setSize] = useState(() => ({
    height: window.innerHeight,
    width: window.innerWidth,
  }));

  useEffect(() => {
    const handleResize = () =>
      setSize({
        height: window.innerHeight,
        width: window.innerWidth,
      });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return size;
}

type WorkspaceViewState = ReturnType<typeof useWorkspaceViewState>;

function ProjectPane({
  chromeInsetTop,
  chat,
  open,
  openSettingsPane,
  setWidth,
  width,
  workspace,
}: {
  chromeInsetTop: boolean;
  chat: ChatView;
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
    <ResizablePane
      label="Resize project sidebar"
      maxWidth={projectPaneMaxWidth}
      minWidth={projectPaneMinWidth}
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
          corruption={chat.corruption}
          createConversation={chat.createConversation}
          createWorkspaceConversation={chat.createWorkspaceConversation}
          deleteConversation={chat.deleteConversation}
          diagnostics={chat.diagnostics}
          openLocalFolder={workspace.openLocalFolder}
          openSettingsPane={openSettingsPane}
          recentWorkspaces={workspace.recentWorkspaces}
          removeRecent={workspace.removeRecent}
          selectConversation={chat.selectConversation}
          selectWorkspace={workspace.selectWorkspace}
          selectedConversationId={chat.selectedConversation?.id ?? ""}
          selectedWorkspaceId={workspace.selectedWorkspaceId}
          chromeInsetTop={chromeInsetTop}
          sidebarWidth={width}
          unreadConversationIds={chat.unreadConversationIds}
        />
      </div>
    </ResizablePane>
  );
}

function AppChromeControls({
  platform,
  projectPaneOpen,
  setProjectPaneOpen,
}: {
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  setProjectPaneOpen: (open: boolean) => void;
}) {
  return (
    <>
      <ShellTopBar platform={platform} />
      <FloatingProjectPaneControl
        active={projectPaneOpen}
        platform={platform}
        setProjectPaneOpen={setProjectPaneOpen}
      />
      <FloatingNiriBenchmarkStatus platform={platform} />
    </>
  );
}

function FloatingProjectPaneControl({
  active,
  platform,
  setProjectPaneOpen,
}: {
  active: boolean;
  platform: DesktopPlatform;
  setProjectPaneOpen: (open: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "app-no-drag fixed top-1 z-50 text-muted-foreground",
        floatingProjectControlLeftInsetClass(platform),
      )}
    >
      <ShellPaneToggle
        active={active}
        label={active ? "Hide project sidebar" : "Show project sidebar"}
        onClick={() => setProjectPaneOpen(!active)}
      >
        <PanelLeftOpen className="h-3.5 w-3.5" />
      </ShellPaneToggle>
    </div>
  );
}

function ShellTopBar({ platform }: { platform: DesktopPlatform }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "app-drag pointer-events-auto fixed top-0 z-30 h-10 bg-transparent",
        shellTopBarDragClass(platform),
      )}
      data-testid="shell-top-bar"
    />
  );
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
          ? "app-no-drag inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent/80 focus-visible:bg-accent/80"
          : "app-no-drag inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent/80 hover:text-muted-foreground focus-visible:bg-accent/80 focus-visible:text-muted-foreground"
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

function FloatingNiriBenchmarkStatus({ platform }: { platform: DesktopPlatform }) {
  return (
    <div
      className={cn(
        "app-no-drag pointer-events-none fixed top-1 z-50 flex items-center gap-1 text-muted-foreground",
        floatingControlsRightInsetClass(platform),
      )}
    >
      <div className="app-no-drag pointer-events-auto flex items-center gap-1">
        <div
          aria-label="Niri Phase 6 benchmark: 500 total panes, 40 visible panes, browser, terminal, canvas, and git graph surfaces"
          className="app-no-drag grid h-7 min-w-7 place-items-center rounded-sm px-1.5 text-[11px] font-semibold text-muted-foreground"
          data-testid="niri-benchmark-status"
          title="500/40 panes with browser, terminal, canvas, and git graph surfaces"
        >
          <span className="inline-flex items-center gap-1">
            <LayoutGrid className="h-3.5 w-3.5" />
            500/40+B/T/G
          </span>
        </div>
      </div>
    </div>
  );
}

function floatingControlsRightInsetClass(platform: DesktopPlatform) {
  return platform === "darwin" ? "right-2" : "right-36";
}

function floatingProjectControlLeftInsetClass(platform: DesktopPlatform) {
  return platform === "darwin" ? "left-[74px]" : "left-2";
}

function shellTopBarDragClass(platform: DesktopPlatform) {
  return platform === "darwin" ? "left-[112px] right-[150px]" : "left-11 right-56";
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
