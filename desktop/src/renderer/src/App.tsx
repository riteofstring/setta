import type {
  ConversationPaneResourceBinding,
  PresentationIntent,
  WorkspaceSession,
} from "@generated/backend";
import type { DesktopPlatform, SettaAPI } from "@shared/types";
import { ArrowLeft, Settings, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { isMobileViewportWidth } from "./app-layout";
import { useAppWindowDragHandlers } from "./app-window-drag";
import { useViewportSize } from "./use-viewport-size";
import { SettingsPanel } from "./components/settings-panel";
import { SettaLogoMark } from "./components/setta-logo-mark";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import {
  createAndPresentConversation,
  conversationCreationRequestEvent,
  conversationCreationRequestKey,
  enqueueConversationPlacementPreflight,
  isConversationCreationRequestAbortedError,
  type ConversationCreationCommand,
  type ConversationCreationEventDetail,
  type ConversationCreationResult,
} from "./features/easy-button/conversation-creation-command";
import { AppShellMasterProvider } from "./features/global-master/app-shell-master";
import type {
  AppShellMasterController,
  MasterInputFocusHints,
} from "./features/global-master/app-shell-master-controller";
import { AppShellMasterSurface } from "./features/global-master/app-shell-master-surface";
import { AppShellSpeechCaptureProvider } from "./features/global-speech/app-shell-speech-capture";
import type { AppShellSpeechCaptureController } from "./features/global-speech/app-shell-speech-capture-controller";
import { AppShellSpeechPlaybackProvider } from "./features/global-speech/app-shell-speech-playback";
import type { AppShellSpeechPlaybackController } from "./features/global-speech/app-shell-speech-playback-controller";
import { AppShellSpeechStatus } from "./features/global-speech/app-shell-speech-status";
import type { GlobalSpeechPresentationSource } from "./features/global-speech/global-speech-presentation";
import { cn } from "./lib/utils";
import {
  masterPaneFocusRequestEvent,
  requestMasterPaneFocus,
} from "./workspace-layout/master-pane-focus";
import { WorkspaceLayoutArea } from "./workspace-layout/WorkspaceLayoutArea";
import { emptyWorkspaceRuntimeId } from "./workspace-layout/workspace-layout-area-runtime";
import type {
  WorkspaceConversationFocusRequest,
  WorkspaceConversationPlacementPreflightRequest,
} from "./workspace-layout/conversation-pane-runtime";
import {
  conversationPaneNavigationRequestEvent,
  conversationPaneRequestForPresentationIntent,
  type ConversationPaneNavigationEventDetail,
  type ConversationPanePlacementRequest,
  type ConversationPanePresentationRequest,
  type ConversationPanePresentationResult,
  type ConversationPanePresentationSuccess,
} from "./workspace-layout/conversation-pane-coordinator";
import { useAppearanceStore } from "./stores/appearance-store";
import { useConversationNavigatorStore } from "./stores/conversation-navigator-store";
import {
  type ConversationPaneWorkspaceState,
  useConversationPaneStore,
} from "./stores/conversation-pane-store";
import { enqueueConversationProjectionEvent } from "./stores/conversation-projection-runtime";
import { resetRuntimeDerivedRendererState } from "./stores/runtime-derived-state";
import { runtimeControlsDisabled, useRuntimeStore } from "./stores/runtime-store";
import {
  type SettingsShellRoute,
  useSettingsNavigationStore,
} from "./stores/settings-navigation-store";
import { workspaceAvailability, useWorkspaceStore } from "./stores/workspace-store";

export function App() {
  const setta = readSettaApi();
  if (!setta) {
    return <AppRuntimeContractError />;
  }
  return <SettaApp setta={setta} />;
}

function SettaApp({ setta }: { setta: SettaAPI }) {
  const selectedWorkspaceId = useWorkspaceStore(
    (state) => state.session?.selectedWorkspaceId ?? "",
  );
  const workspaceSession = useWorkspaceStore((state) => state.session);
  const syncConversationNavigatorWorkspaces = useConversationNavigatorStore(
    (state) => state.syncWorkspaces,
  );
  const activeConversationWorkspaceKey =
    workspaceSession?.activeWorkspaces.map((workspace) => workspace.id).join("\u0000") ?? "";
  const masterInputFocusHints = useMasterInputFocusHints(selectedWorkspaceId);
  const platform = setta.app.platform;
  const viewport = useViewportSize();
  useAppearanceSettings();
  const runtime = useRuntimeLifecycle(setta);
  const [workspaceConversationFocusRequest, setWorkspaceConversationFocusRequest] =
    useState<WorkspaceConversationFocusRequest | null>(null);
  const [
    workspaceConversationPlacementPreflightRequest,
    setWorkspaceConversationPlacementPreflightRequest,
  ] = useState<WorkspaceConversationPlacementPreflightRequest | null>(null);
  const [, setConversationPresentationError] = useState<string | null>(null);
  const conversationPresentationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const conversationPlacementPreflightQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingConversationCreationsRef = useRef(new Set<string>());
  const settingsFocusRestoreRef = useRef<HTMLElement | null>(null);
  const settingsRouteWasOpenRef = useRef(false);
  const settingsRoute = useSettingsNavigationStore((state) => state.route);
  const openSettings = useSettingsNavigationStore((state) => state.openSettings);
  const openVoiceProviderSelection = useSettingsNavigationStore(
    (state) => state.openVoiceProviderSelection,
  );
  const closeSettings = useSettingsNavigationStore((state) => state.closeSettings);
  const settingsPageOpen = settingsRoute.page === "settings";
  const mobileViewport = isMobileViewportWidth(viewport.width);
  const captureSettingsFocusOrigin = useCallback(() => {
    settingsFocusRestoreRef.current = activeFocusableElement();
  }, []);
  const openSettingsPage = useCallback(() => {
    captureSettingsFocusOrigin();
    openSettings();
  }, [captureSettingsFocusOrigin, openSettings]);
  const openVoiceCredentialSettings = useCallback(() => {
    captureSettingsFocusOrigin();
    openVoiceProviderSelection();
  }, [captureSettingsFocusOrigin, openVoiceProviderSelection]);
  const closeSettingsPage = useCallback(() => {
    closeSettings();
  }, [closeSettings]);
  useEffect(() => {
    if (settingsPageOpen && !settingsRouteWasOpenRef.current && !settingsFocusRestoreRef.current) {
      settingsFocusRestoreRef.current = activeFocusableElement();
    }
    if (!settingsPageOpen && settingsRouteWasOpenRef.current) {
      restoreFocus(settingsFocusRestoreRef.current);
      settingsFocusRestoreRef.current = null;
    }
    settingsRouteWasOpenRef.current = settingsPageOpen;
  }, [settingsPageOpen]);
  useEffect(() => {
    const workspaceIds =
      activeConversationWorkspaceKey.length === 0
        ? []
        : activeConversationWorkspaceKey.split("\u0000");
    void syncConversationNavigatorWorkspaces(workspaceIds);
  }, [activeConversationWorkspaceKey, syncConversationNavigatorWorkspaces]);
  useEffect(() => {
    const closeSettingsForMasterPaneFocus = () => {
      if (useSettingsNavigationStore.getState().route.page === "settings") {
        closeSettings();
      }
    };
    window.addEventListener(masterPaneFocusRequestEvent, closeSettingsForMasterPaneFocus);
    return () =>
      window.removeEventListener(masterPaneFocusRequestEvent, closeSettingsForMasterPaneFocus);
  }, [closeSettings]);
  const applyConversationPresentationRequest = useCallback(
    async (
      request: ConversationPanePresentationRequest,
    ): Promise<ConversationPanePresentationSuccess> => {
      await ensureConversationPresentationWorkspaceMounted(request.workspaceId);
      setConversationPresentationError(null);
      const result = await new Promise<ConversationPanePresentationResult>((resolve) => {
        setWorkspaceConversationFocusRequest((current) => ({
          ...request,
          complete: resolve,
          requestId: (current?.requestId ?? 0) + 1,
        }));
      });
      if (result.kind === "blocked") {
        throw new Error(result.reason);
      }
      return result;
    },
    [],
  );
  const presentConversationRequest = useCallback(
    (
      request: ConversationPanePresentationRequest,
    ): Promise<ConversationPanePresentationSuccess> => {
      const pending = conversationPresentationQueueRef.current.then(() =>
        applyConversationPresentationRequest(request),
      );
      conversationPresentationQueueRef.current = pending.then(
        () => undefined,
        () => undefined,
      );
      return pending;
    },
    [applyConversationPresentationRequest],
  );
  const dispatchConversationPlacementPreflightRequest = useCallback(
    (request: ConversationPanePlacementRequest): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        setWorkspaceConversationPlacementPreflightRequest((current) => ({
          ...request,
          complete: (result) => {
            if (result.kind === "blocked") {
              reject(new Error(result.reason));
              return;
            }
            resolve();
          },
          requestId: (current?.requestId ?? 0) + 1,
        }));
      }),
    [],
  );
  const preflightConversationPlacementRequest = useCallback(
    (request: ConversationPanePlacementRequest): Promise<void> =>
      enqueueConversationPlacementPreflight(
        conversationPlacementPreflightQueueRef,
        dispatchConversationPlacementPreflightRequest,
        request,
      ),
    [dispatchConversationPlacementPreflightRequest],
  );
  const ensureConversationWorkspaceAvailable = useCallback((workspaceId: string | null) => {
    if (workspaceId === null) {
      return;
    }
    const availability = workspaceAvailability(useWorkspaceStore.getState().session, workspaceId);
    if (!availability) {
      throw new Error(`Workspace ${workspaceId} is not open.`);
    }
    if (!availability.available) {
      throw new Error(availability.unavailableReason || `Workspace ${workspaceId} is unavailable.`);
    }
  }, []);
  const presentAppLevelConversationRequest = useCallback(
    async (
      request: ConversationPanePresentationRequest,
    ): Promise<ConversationPanePresentationSuccess> =>
      presentConversationRequest(appLevelConversationPresentationRequest(request)),
    [presentConversationRequest],
  );
  const createConversationRequest = useCallback<ConversationCreationCommand>(
    (request, lifecycle): Promise<ConversationCreationResult> => {
      const pendingKey = conversationCreationRequestKey(request);
      if (pendingConversationCreationsRef.current.has(pendingKey)) {
        const error = new Error(
          "A new conversation is already being created for that destination.",
        );
        setConversationPresentationError(error.message);
        return Promise.reject(error);
      }
      pendingConversationCreationsRef.current.add(pendingKey);
      const pending = createAndPresentConversation({
        assertCurrent: lifecycle?.assertCurrent,
        createConversation: (creationRequest) => setta.conversations.create(creationRequest),
        ensureWorkspaceAvailable: ensureConversationWorkspaceAvailable,
        preflightPlacement: preflightConversationPlacementRequest,
        presentConversation: presentAppLevelConversationRequest,
        request,
      })
        .then((result) => {
          setConversationPresentationError(null);
          return result;
        })
        .catch((error: unknown) => {
          if (!isConversationCreationRequestAbortedError(error)) {
            setConversationPresentationError(conversationErrorMessage(error));
          }
          throw error;
        })
        .finally(() => {
          pendingConversationCreationsRef.current.delete(pendingKey);
        });
      return pending;
    },
    [
      ensureConversationWorkspaceAvailable,
      preflightConversationPlacementRequest,
      presentAppLevelConversationRequest,
      setta,
    ],
  );
  const presentMasterIntent = useCallback(
    async (intent: PresentationIntent) => {
      const request = conversationPaneRequestForPresentationIntent(intent);
      if (request) {
        return presentAppLevelConversationRequest(request);
      }
      throw new Error(`Master presentation intent ${intent.id} has no conversation target.`);
    },
    [presentAppLevelConversationRequest],
  );
  useEffect(() => {
    const navigate = (event: Event) => {
      const detail = (event as CustomEvent<ConversationPaneNavigationEventDetail>).detail;
      if (!detail?.request || detail.completion) {
        return;
      }
      detail.completion = presentAppLevelConversationRequest(detail.request);
    };
    window.addEventListener(conversationPaneNavigationRequestEvent, navigate);
    return () => window.removeEventListener(conversationPaneNavigationRequestEvent, navigate);
  }, [presentAppLevelConversationRequest]);
  useEffect(() => {
    const create = (event: Event) => {
      const detail = (event as CustomEvent<ConversationCreationEventDetail>).detail;
      if (!detail?.request || detail.completion) {
        return;
      }
      detail.completion = createConversationRequest(detail.request);
    };
    window.addEventListener(conversationCreationRequestEvent, create);
    return () => window.removeEventListener(conversationCreationRequestEvent, create);
  }, [createConversationRequest]);
  useEffect(() => setta.conversations.onEvent(enqueueConversationProjectionEvent), [setta]);

  const shell = ({
    master,
    speechCapture,
    speechPlayback,
    speechPresentation,
  }: {
    master?: AppShellMasterController;
    speechCapture?: AppShellSpeechCaptureController;
    speechPlayback?: AppShellSpeechPlaybackController;
    speechPresentation?: GlobalSpeechPresentationSource;
  } = {}) => {
    const workspaceShellHidden = settingsPageOpen;
    return (
      <>
        <div
          aria-hidden={workspaceShellHidden || undefined}
          className="fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-background text-foreground"
          data-testid="app-workspace-shell"
          inert={workspaceShellHidden || undefined}
        >
          <AppChromeControls
            globalSpeechAvailable={speechCapture !== undefined}
            master={master}
            mobileViewport={mobileViewport}
            openVoiceCredentialSettings={openVoiceCredentialSettings}
            openSettingsPage={openSettingsPage}
            platform={platform}
          />
          <main className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
            <WorkspaceLayoutArea
              focusConversationRequest={workspaceConversationFocusRequest}
              masterController={master}
              masterSpeechCapture={speechCapture}
              masterSpeechPlayback={speechPlayback}
              onConversationPresentationError={setConversationPresentationError}
              onOpenSettingsPage={openSettingsPage}
              onOpenVoiceCredentialSettings={openVoiceCredentialSettings}
              placementPreflightRequest={workspaceConversationPlacementPreflightRequest}
              platform={platform}
              shellOverlayActive={workspaceShellHidden}
              speechCapture={speechCapture}
              speechPresentation={speechPresentation}
            />
          </main>
        </div>
        {settingsRoute.page === "settings" ? (
          <SettingsShellPage onBack={closeSettingsPage} platform={platform} route={settingsRoute} />
        ) : null}
      </>
    );
  };
  if (!setta.workspaceNativeViews) {
    return shell();
  }
  return (
    <AppShellMasterProvider
      focusHints={masterInputFocusHints}
      presentPresentationIntent={presentMasterIntent}
      runtimeId={runtime.connectedRuntimeId}
      setta={setta}
    >
      {(master) => (
        <AppShellSpeechPlaybackProvider runtimeId={runtime.connectedRuntimeId} setta={setta}>
          {(playback) => (
            <AppShellSpeechCaptureProvider
              master={master}
              onCaptureEnd={playback.resumeAfterCapture}
              onCaptureStart={playback.preemptForCapture}
              playback={playback}
              runtimeId={runtime.connectedRuntimeId}
              setta={setta}
            >
              {(speechCapture, speechPresentation) => (
                <AppShellMasterSurface
                  onOpenVoiceCredentialSettings={openVoiceCredentialSettings}
                  platform={platform}
                >
                  {() =>
                    shell({
                      master,
                      speechCapture,
                      speechPlayback: playback,
                      speechPresentation,
                    })
                  }
                </AppShellMasterSurface>
              )}
            </AppShellSpeechCaptureProvider>
          )}
        </AppShellSpeechPlaybackProvider>
      )}
    </AppShellMasterProvider>
  );
}

function useMasterInputFocusHints(selectedWorkspaceId: string): MasterInputFocusHints {
  const workspaceSession = useWorkspaceStore((state) => state.session);
  const mountedPaneWorkspaceId = currentMountedPaneWorkspaceId(selectedWorkspaceId);
  const focusedWorkspacePanes = useConversationPaneStore((state) =>
    state.workspaces.get(mountedPaneWorkspaceId),
  );
  return masterInputFocusHints(workspaceSession, focusedWorkspacePanes);
}

export function masterInputFocusHints(
  workspaceSession: WorkspaceSession | null,
  focusedWorkspacePanes: ConversationPaneWorkspaceState | undefined,
): MasterInputFocusHints {
  if (!focusedWorkspacePanes) {
    return {
      focusedConversationId: null,
      focusedPaneId: null,
      focusedWorkspaceId: null,
    };
  }
  return {
    focusedConversationId: focusedWorkspacePanes.focusedConversationId,
    focusedPaneId: focusedWorkspacePanes.focusedPaneId,
    focusedWorkspaceId: focusedWorkspaceIdForResourceBindings(
      workspaceSession,
      focusedWorkspacePanes.focusedConversationResourceBindings,
    ),
  };
}

function currentMountedPaneWorkspaceId(selectedWorkspaceId: string): string {
  return selectedWorkspaceId.length > 0 ? selectedWorkspaceId : emptyWorkspaceRuntimeId;
}

function appLevelConversationPresentationRequest(
  request: ConversationPanePresentationRequest,
): ConversationPanePresentationRequest {
  const session = useWorkspaceStore.getState().session;
  return {
    ...request,
    resourceBindings: conversationPresentationResourceBindings(request, session),
    workspaceId: currentMountedPaneWorkspaceId(session?.selectedWorkspaceId ?? ""),
  };
}

async function ensureConversationPresentationWorkspaceMounted(
  requestWorkspaceId: string,
): Promise<void> {
  const mountedWorkspaceId = currentMountedPaneWorkspaceId(
    useWorkspaceStore.getState().session?.selectedWorkspaceId ?? "",
  );
  if (mountedWorkspaceId === requestWorkspaceId) {
    return;
  }
  throw new Error(`The app pane scene ${requestWorkspaceId} is not mounted.`);
}

function conversationPresentationResourceBindings(
  request: ConversationPanePresentationRequest,
  session: WorkspaceSession | null,
): ConversationPaneResourceBinding[] {
  if (request.resourceBindings !== undefined) {
    return request.resourceBindings;
  }
  if (request.workspaceId === emptyWorkspaceRuntimeId) {
    return [];
  }
  const workspace = session?.activeWorkspaces.find(
    (candidate) => candidate.id === request.workspaceId,
  );
  if (!workspace) {
    throw new Error(`Workspace ${request.workspaceId} is not open.`);
  }
  return [{ folder: { rootPath: workspace.rootPath }, kind: "folder" }];
}

function focusedWorkspaceIdForResourceBindings(
  workspaceSession: WorkspaceSession | null,
  bindings: readonly ConversationPaneResourceBinding[] | null,
): string | null {
  const folderRootPath = bindings?.find((binding) => binding.kind === "folder")?.folder.rootPath;
  if (!folderRootPath) {
    return null;
  }
  return (
    workspaceSession?.activeWorkspaces.find((workspace) => workspace.rootPath === folderRootPath)
      ?.id ?? null
  );
}

function readSettaApi(): SettaAPI | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (window as Window & { setta?: SettaAPI }).setta ?? null;
}

function conversationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The conversation could not be opened.";
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

type SettingsPageRoute = Extract<SettingsShellRoute, { page: "settings" }>;

function SettingsShellPage({
  onBack,
  platform,
  route,
}: {
  onBack: () => void;
  platform: DesktopPlatform;
  route: SettingsPageRoute;
}) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const headingFocusRequestIdRef = useRef(0);
  const windowDragHandlers = useAppWindowDragHandlers();

  useEffect(() => {
    if (route.focusTarget) {
      headingFocusRequestIdRef.current = route.requestId;
      return;
    }
    if (headingFocusRequestIdRef.current === route.requestId) {
      return;
    }
    headingFocusRequestIdRef.current = route.requestId;
    headingRef.current?.focus({ preventScroll: true });
  }, [route.focusTarget, route.requestId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      onBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  return (
    <section
      aria-labelledby="setta-settings-page-title"
      className="setta-settings-page bg-background text-foreground"
      data-desktop-platform={platform}
      data-testid="settings-shell-page"
    >
      <header
        className="setta-settings-page-header app-drag"
        data-setta-shell-title-bar="true"
        {...windowDragHandlers}
      >
        <div aria-hidden="true" className="setta-settings-page-chrome-shield app-no-drag" />
        <button className="setta-settings-page-back app-no-drag" onClick={onBack} type="button">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to panes</span>
        </button>
        <h1 id="setta-settings-page-title" ref={headingRef} tabIndex={-1}>
          Settings
        </h1>
      </header>
      <div className="setta-settings-page-body">
        <SettingsPanel />
      </div>
    </section>
  );
}

function activeFocusableElement(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) {
    return null;
  }
  return active;
}

function restoreFocus(element: HTMLElement | null): void {
  if (!element || typeof document === "undefined" || !document.contains(element)) {
    return;
  }
  element.focus({ preventScroll: true });
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

function AppChromeControls({
  globalSpeechAvailable,
  master,
  mobileViewport,
  openVoiceCredentialSettings,
  openSettingsPage,
  platform,
}: {
  globalSpeechAvailable: boolean;
  master: AppShellMasterController | undefined;
  mobileViewport: boolean;
  openVoiceCredentialSettings: () => void;
  openSettingsPage: () => void;
  platform: DesktopPlatform;
}) {
  if (mobileViewport) {
    return null;
  }
  return (
    <DesktopShellTopBar
      globalSpeechAvailable={globalSpeechAvailable}
      master={master}
      onOpenVoiceCredentialSettings={openVoiceCredentialSettings}
      onOpenSettings={openSettingsPage}
      platform={platform}
    />
  );
}

function DesktopShellTopBar({
  globalSpeechAvailable,
  master,
  onOpenVoiceCredentialSettings,
  onOpenSettings,
  platform,
}: {
  globalSpeechAvailable: boolean;
  master: AppShellMasterController | undefined;
  onOpenVoiceCredentialSettings: () => void;
  onOpenSettings: () => void;
  platform: DesktopPlatform;
}) {
  const windowDragHandlers = useAppWindowDragHandlers();
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
          <div aria-label="Setta controls" className="setta-shell-top-bar-controls app-no-drag">
            {master ? (
              <ShellTopBarButton
                active={false}
                label="Ask Setta"
                onClick={() => requestMasterPaneFocus("chrome")}
                testId="master-pane-button"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </ShellTopBarButton>
            ) : null}
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
      {globalSpeechAvailable ? (
        <AppShellSpeechStatus onOpenVoiceCredentialSettings={onOpenVoiceCredentialSettings} />
      ) : null}
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
