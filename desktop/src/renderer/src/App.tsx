import type { PresentationIntent, WorkspaceSession } from "@generated/backend";
import type { DesktopPlatform, SettaAPI } from "@shared/types";
import { ArrowLeft, PanelLeftClose, PanelLeftOpen, Settings, Sparkles } from "lucide-react";
import type { Dispatch, ErrorInfo, ReactNode, SetStateAction } from "react";
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
import { SettingsPanel } from "./components/settings-panel";
import { SettaLogoMark } from "./components/setta-logo-mark";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
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
import { useInitialEasyButtonPane } from "./features/easy-button/initial-easy-button-pane";
import { AppShellMasterProvider } from "./features/global-master/app-shell-master";
import type {
  AppShellMasterController,
  MasterInputFocusHints,
} from "./features/global-master/app-shell-master-controller";
import {
  AppShellMasterSurface,
  masterOverlayShortcutLabel,
} from "./features/global-master/app-shell-master-surface";
import { AppShellSpeechCaptureProvider } from "./features/global-speech/app-shell-speech-capture";
import type { AppShellSpeechCaptureController } from "./features/global-speech/app-shell-speech-capture-controller";
import { AppShellSpeechPlaybackProvider } from "./features/global-speech/app-shell-speech-playback";
import { AppShellSpeechStatus } from "./features/global-speech/app-shell-speech-status";
import type { GlobalSpeechPresentationSource } from "./features/global-speech/global-speech-presentation";
import { cn } from "./lib/utils";
import { WorkspaceLayoutArea } from "./workspace-layout/WorkspaceLayoutArea";
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
import {
  type WorkspaceOperation,
  type WorkspaceStatus,
  workspaceAvailability,
  useWorkspaceStore,
} from "./stores/workspace-store";

const PrototypeGalleryPage = lazy(
  () => import("./features/prototype-gallery/prototype-gallery-page"),
);

export function App() {
  const setta = readSettaApi();
  if (!setta) {
    return <AppRuntimeContractError />;
  }
  return <SettaApp setta={setta} />;
}

function SettaApp({ setta }: { setta: SettaAPI }) {
  const workspace = useWorkspaceViewState();
  const activeWorkspaceIds = useMemo(
    () => workspace.activeWorkspaces.map((activeWorkspace) => activeWorkspace.id),
    [workspace.activeWorkspaces],
  );
  const masterInputFocusHints = useMasterInputFocusHints(workspace.selectedWorkspaceId);
  const platform = setta.app.platform;
  const viewport = useViewportSize();
  useAppearanceSettings();
  const runtime = useRuntimeLifecycle(setta);
  const [projectPaneWidth, setProjectPaneWidth] = useState(projectPaneDefaultWidth);
  const [projectPaneOpen, setProjectPaneOpen] = useState(false);
  const [workspaceConversationFocusRequest, setWorkspaceConversationFocusRequest] =
    useState<WorkspaceConversationFocusRequest | null>(null);
  const [
    workspaceConversationPlacementPreflightRequest,
    setWorkspaceConversationPlacementPreflightRequest,
  ] = useState<WorkspaceConversationPlacementPreflightRequest | null>(null);
  const [conversationPresentationError, setConversationPresentationError] = useState<string | null>(
    null,
  );
  const conversationPresentationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const conversationPlacementPreflightQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingConversationCreationsRef = useRef(new Set<string>());
  const settingsFocusRestoreRef = useRef<HTMLElement | null>(null);
  const utilityRouteWasOpenRef = useRef(false);
  const settingsRoute = useSettingsNavigationStore((state) => state.route);
  const openSettings = useSettingsNavigationStore((state) => state.openSettings);
  const openVoiceProviderSelection = useSettingsNavigationStore(
    (state) => state.openVoiceProviderSelection,
  );
  const closeSettings = useSettingsNavigationStore((state) => state.closeSettings);
  const returnToDeveloperSettings = useSettingsNavigationStore(
    (state) => state.returnToDeveloperSettings,
  );
  const utilityPageOpen = settingsRoute.page !== "workspace";
  const effectiveProjectPaneWidth = compactProjectPaneWidth(projectPaneWidth, viewport.width);
  const mobileViewport = isMobileViewportWidth(viewport.width);
  const toggleProjectPane = useCallback(() => {
    setProjectPaneOpen((current) => !current);
  }, []);
  // The project pane is summoned explicitly. Keep it closed on launch and when
  // entering the mobile layout so the focused chat owns the app surface.
  useEffect(() => {
    if (mobileViewport) {
      setProjectPaneOpen(false);
    }
  }, [mobileViewport]);
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
    if (utilityPageOpen && !utilityRouteWasOpenRef.current && !settingsFocusRestoreRef.current) {
      settingsFocusRestoreRef.current = activeFocusableElement();
    }
    if (!utilityPageOpen && utilityRouteWasOpenRef.current) {
      restoreFocus(settingsFocusRestoreRef.current);
      settingsFocusRestoreRef.current = null;
    }
    utilityRouteWasOpenRef.current = utilityPageOpen;
  }, [utilityPageOpen]);
  const applyConversationPresentationRequest = useCallback(
    async (
      request: ConversationPanePresentationRequest,
    ): Promise<ConversationPanePresentationSuccess> => {
      if (useWorkspaceStore.getState().session?.selectedWorkspaceId !== request.workspaceId) {
        await workspace.selectWorkspace(request.workspaceId);
        if (useWorkspaceStore.getState().session?.selectedWorkspaceId !== request.workspaceId) {
          throw new Error(`Setta could not select workspace ${request.workspaceId}.`);
        }
      }
      setConversationPresentationError(null);
      const result = await new Promise<ConversationPanePresentationResult>((resolve) => {
        setWorkspaceConversationFocusRequest((current) => ({
          ...request,
          complete: resolve,
          requestId: (current?.requestId ?? 0) + 1,
        }));
      });
      if (mobileViewport) {
        setProjectPaneOpen(false);
      }
      if (result.kind === "blocked") {
        throw new Error(result.reason);
      }
      return result;
    },
    [mobileViewport, workspace.selectWorkspace],
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
  const ensureConversationWorkspaceAvailable = useCallback((workspaceId: string) => {
    if (workspaceId.length === 0) {
      throw new Error(
        "Setta needs an available project folder before it can start a new conversation.",
      );
    }
    const availability = workspaceAvailability(useWorkspaceStore.getState().session, workspaceId);
    if (!availability) {
      throw new Error(`Workspace ${workspaceId} is not open.`);
    }
    if (!availability.available) {
      throw new Error(availability.unavailableReason || `Workspace ${workspaceId} is unavailable.`);
    }
  }, []);
  const ensureConversationWorkspaceSelected = useCallback(
    async (workspaceId: string): Promise<void> => {
      if (useWorkspaceStore.getState().session?.selectedWorkspaceId === workspaceId) {
        return;
      }
      await workspace.selectWorkspace(workspaceId);
      if (useWorkspaceStore.getState().session?.selectedWorkspaceId !== workspaceId) {
        throw new Error(`Setta could not select workspace ${workspaceId}.`);
      }
    },
    [workspace.selectWorkspace],
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
        ensureWorkspaceSelected: ensureConversationWorkspaceSelected,
        preflightPlacement: preflightConversationPlacementRequest,
        presentConversation: presentConversationRequest,
        request,
      })
        .then((result) => {
          setConversationPresentationError(null);
          if (mobileViewport) {
            setProjectPaneOpen(false);
          }
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
      ensureConversationWorkspaceSelected,
      mobileViewport,
      preflightConversationPlacementRequest,
      presentConversationRequest,
      setta,
    ],
  );
  const setInitialConversationError = useCallback((message: string | null) => {
    setConversationPresentationError(message);
  }, []);
  const initialEasyButtonPaneStartup = useInitialEasyButtonPane({
    activeWorkspaceIds,
    connectedRuntimeId: runtime.connectedRuntimeId,
    createConversation: createConversationRequest,
    onError: setInitialConversationError,
    presentConversation: presentConversationRequest,
    selectedWorkspaceId: workspace.selectedWorkspaceId,
    selectedWorkspaceAvailable: workspace.selectedWorkspaceAvailable,
  });
  const presentConversation = useCallback(
    async (workspaceId: string, conversationId: string, title: string): Promise<void> => {
      try {
        await presentConversationRequest({ conversationId, title, workspaceId });
      } catch (error) {
        setConversationPresentationError(
          error instanceof Error ? error.message : "The conversation pane could not be opened.",
        );
      }
    },
    [presentConversationRequest],
  );
  const createConversation = useCallback(
    async (workspaceId: string): Promise<void> => {
      try {
        await createConversationRequest({
          destination: { kind: "new-pane" },
          workspaceId,
        });
      } catch {
        // createConversationRequest owns the visible failure state for this UI command.
      }
    },
    [createConversationRequest],
  );
  const presentMasterIntent = useCallback(
    async (intent: PresentationIntent) => {
      const request = conversationPaneRequestForPresentationIntent(intent);
      if (request) {
        return presentConversationRequest(request);
      }
      throw new Error(`Master presentation intent ${intent.id} has no conversation target.`);
    },
    [presentConversationRequest],
  );
  useEffect(() => {
    const navigate = (event: Event) => {
      const detail = (event as CustomEvent<ConversationPaneNavigationEventDetail>).detail;
      if (!detail?.request || detail.completion) {
        return;
      }
      detail.completion = presentConversationRequest(detail.request);
    };
    window.addEventListener(conversationPaneNavigationRequestEvent, navigate);
    return () => window.removeEventListener(conversationPaneNavigationRequestEvent, navigate);
  }, [presentConversationRequest]);
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
    masterOverlayOpen = false,
    speechCapture,
    speechPresentation,
  }: {
    master?: AppShellMasterController;
    masterOverlayOpen?: boolean;
    speechCapture?: AppShellSpeechCaptureController;
    speechPresentation?: GlobalSpeechPresentationSource;
  } = {}) => {
    const workspaceShellHidden = masterOverlayOpen || utilityPageOpen;
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
            masterOverlayOpen={masterOverlayOpen}
            mobileViewport={mobileViewport}
            openVoiceCredentialSettings={openVoiceCredentialSettings}
            openSettingsPage={openSettingsPage}
            platform={platform}
            projectPaneOpen={projectPaneOpen}
            setProjectPaneOpen={setProjectPaneOpen}
          />
          <main className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
            <ProjectPane
              clearConversationPresentationError={() => setConversationPresentationError(null)}
              conversationPresentationError={conversationPresentationError}
              createConversation={createConversation}
              master={master}
              mobileOverlay={mobileViewport}
              open={projectPaneOpen}
              openSettingsPage={openSettingsPage}
              presentConversation={presentConversation}
              setWidth={setProjectPaneWidth}
              viewportWidth={viewport.width}
              width={effectiveProjectPaneWidth}
              runtimeUnavailable={runtime.controlsDisabled}
              workspace={workspace}
            />
            <WorkspaceLayoutArea
              focusConversationRequest={workspaceConversationFocusRequest}
              initialEasyButtonPaneStartup={initialEasyButtonPaneStartup}
              onConversationPresentationError={setConversationPresentationError}
              onOpenSettingsPage={openSettingsPage}
              placementPreflightRequest={workspaceConversationPlacementPreflightRequest}
              onToggleProjectPane={toggleProjectPane}
              platform={platform}
              projectPaneOpen={projectPaneOpen}
              projectPaneWidth={mobileViewport || !projectPaneOpen ? 0 : effectiveProjectPaneWidth}
              shellOverlayActive={workspaceShellHidden}
              speechCapture={speechCapture}
              speechPresentation={speechPresentation}
            />
          </main>
        </div>
        {settingsRoute.page === "settings" ? (
          <SettingsShellPage onBack={closeSettingsPage} platform={platform} route={settingsRoute} />
        ) : null}
        {settingsRoute.page === "prototype-gallery" ? (
          <PrototypeGalleryErrorBoundary onBack={returnToDeveloperSettings}>
            <Suspense fallback={<UtilityPageLoading label="Loading visual prototypes" />}>
              <PrototypeGalleryPage onBack={returnToDeveloperSettings} platform={platform} />
            </Suspense>
          </PrototypeGalleryErrorBoundary>
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
                  controller={master}
                  onOpenVoiceCredentialSettings={openVoiceCredentialSettings}
                  platform={platform}
                >
                  {(masterOverlayOpen) =>
                    shell({
                      master,
                      masterOverlayOpen,
                      speechCapture,
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

interface PrototypeGalleryErrorBoundaryProps {
  children: ReactNode;
  onBack: () => void;
}

interface PrototypeGalleryErrorBoundaryState {
  failed: boolean;
}

class PrototypeGalleryErrorBoundary extends Component<
  PrototypeGalleryErrorBoundaryProps,
  PrototypeGalleryErrorBoundaryState
> {
  override state: PrototypeGalleryErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): PrototypeGalleryErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Visual prototype gallery failed to load.", error, errorInfo);
  }

  override render() {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <section className="fixed inset-0 z-[70] grid place-items-center bg-background px-6 text-foreground">
        <div aria-hidden="true" className="app-drag absolute inset-x-0 top-0 h-12" />
        <article
          className="relative grid max-w-md gap-4 rounded-lg border border-border bg-card p-5 shadow-2xl"
          role="alert"
        >
          <header className="grid gap-1.5">
            <h1 className="text-sm font-semibold">Visual prototypes could not be opened.</h1>
            <p className="text-xs leading-5 text-muted-foreground">
              Return to Developer settings, or reload Setta to try loading the gallery again.
            </p>
          </header>
          <div className="flex flex-wrap gap-2">
            <button
              className="min-h-10 rounded-sm border border-border px-3 text-xs font-semibold outline-none transition-[scale,background-color] hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]"
              onClick={this.props.onBack}
              type="button"
            >
              Back to Developer settings
            </button>
            <button
              className="min-h-10 rounded-sm bg-primary px-3 text-xs font-semibold text-primary-foreground outline-none transition-[scale,opacity] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]"
              onClick={() => window.location.reload()}
              type="button"
            >
              Reload Setta
            </button>
          </div>
        </article>
      </section>
    );
  }
}

function UtilityPageLoading({ label }: { label: string }) {
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-background text-xs text-muted-foreground"
      role="status"
    >
      {label}
    </div>
  );
}

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
          <span>Back to workspace</span>
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

type WorkspaceViewState = ReturnType<typeof useWorkspaceViewState>;
function ProjectPane({
  clearConversationPresentationError,
  conversationPresentationError,
  createConversation,
  master,
  mobileOverlay,
  open,
  openSettingsPage,
  presentConversation,
  setWidth,
  viewportWidth,
  width,
  runtimeUnavailable,
  workspace,
}: {
  clearConversationPresentationError: () => void;
  conversationPresentationError: string | null;
  createConversation: (workspaceId: string) => Promise<void>;
  master: AppShellMasterController | undefined;
  mobileOverlay: boolean;
  open: boolean;
  openSettingsPage: () => void;
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
      createConversation={createConversation}
      masterUnavailable={runtimeUnavailable}
      openLocalFolder={workspace.openLocalFolder}
      openMasterOverlay={master?.openOverlay}
      openSettingsPage={openSettingsPage}
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
      workspaceAvailabilities={workspace.workspaceAvailabilities}
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
  globalSpeechAvailable,
  master,
  masterOverlayOpen,
  mobileViewport,
  openVoiceCredentialSettings,
  openSettingsPage,
  platform,
  projectPaneOpen,
  setProjectPaneOpen,
}: {
  globalSpeechAvailable: boolean;
  master: AppShellMasterController | undefined;
  masterOverlayOpen: boolean;
  mobileViewport: boolean;
  openVoiceCredentialSettings: () => void;
  openSettingsPage: () => void;
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  setProjectPaneOpen: Dispatch<SetStateAction<boolean>>;
}) {
  if (mobileViewport) {
    return null;
  }
  return (
    <DesktopShellTopBar
      globalSpeechAvailable={globalSpeechAvailable}
      master={master}
      masterOverlayOpen={masterOverlayOpen}
      onOpenVoiceCredentialSettings={openVoiceCredentialSettings}
      onOpenSettings={openSettingsPage}
      platform={platform}
      projectPaneOpen={projectPaneOpen}
      setProjectPaneOpen={setProjectPaneOpen}
    />
  );
}

function DesktopShellTopBar({
  globalSpeechAvailable,
  master,
  masterOverlayOpen,
  onOpenVoiceCredentialSettings,
  onOpenSettings,
  platform,
  projectPaneOpen,
  setProjectPaneOpen,
}: {
  globalSpeechAvailable: boolean;
  master: AppShellMasterController | undefined;
  masterOverlayOpen: boolean;
  onOpenVoiceCredentialSettings: () => void;
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
            {master ? (
              <ShellTopBarButton
                active={masterOverlayOpen}
                label={`Ask Setta (${masterOverlayShortcutLabel(platform)})`}
                onClick={master.openOverlay}
                testId="master-overlay-button"
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

function useWorkspaceViewState() {
  const state = useWorkspaceStore((workspaceState) => workspaceState);
  const selectedWorkspace = useSelectedWorkspace(state.session);
  return workspaceViewState(state, selectedWorkspace);
}

function workspaceViewState(
  state: ReturnType<typeof useWorkspaceStore.getState>,
  selectedWorkspace: WorkspaceSession["activeWorkspaces"][number] | null,
) {
  return {
    ...workspaceSessionViewState(state.session, selectedWorkspace),
    busy: workspaceOperationBusy(state.operation, state.status),
    clearError: state.clearError,
    closeWorkspace: state.closeWorkspace,
    error: state.error,
    openLocalFolder: state.openLocalFolder,
    openWorkspacePath: state.openWorkspacePath,
    operation: state.operation,
    removeRecent: state.removeRecent,
    selectWorkspace: state.selectWorkspace,
    status: state.status,
  };
}

function workspaceSessionViewState(
  session: WorkspaceSession | null,
  selectedWorkspace: WorkspaceSession["activeWorkspaces"][number] | null,
) {
  if (!session) {
    return {
      activeWorkspaces: [],
      recentWorkspaces: [],
      selectedWorkspace,
      selectedWorkspaceAvailable: false,
      selectedWorkspaceId: "",
      workspaceAvailabilities: [],
    };
  }
  const selectedAvailability = workspaceAvailability(session, session.selectedWorkspaceId);
  return {
    activeWorkspaces: session.activeWorkspaces,
    recentWorkspaces: session.recentWorkspaces,
    selectedWorkspace,
    selectedWorkspaceAvailable: selectedAvailability?.available ?? false,
    selectedWorkspaceId: session.selectedWorkspaceId,
    workspaceAvailabilities: session.workspaceAvailabilities,
  };
}

function workspaceOperationBusy(operation: WorkspaceOperation, status: WorkspaceStatus): boolean {
  return operation !== null || status === "loading";
}

function useSelectedWorkspace(session: WorkspaceSession | null) {
  return useMemo(() => {
    return (
      session?.activeWorkspaces.find((workspace) => workspace.id === session.selectedWorkspaceId) ??
      null
    );
  }, [session]);
}
