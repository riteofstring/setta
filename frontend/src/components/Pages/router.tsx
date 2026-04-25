import { HeaderContainer } from "components/AppHeader/Header";
import { ModalContainer } from "components/Modals/ModalContainer";
import { AppShell } from "components/Pages/AppShell";
import { HomePage } from "components/Pages/Home/HomePage";
import { WorkspaceLaunchPage } from "components/Pages/Launch/WorkspaceLaunchPage";
import { LauncherHomePage } from "components/Pages/Launcher/LauncherHomePage";
import { LoadingSpinner } from "components/Pages/LoadingSpinner";
import { NotFound } from "components/Pages/NotFound/NotFound";
import { ShareMainContainer } from "components/Pages/Share/ShareMainContainer";
import { ShareWrapper } from "components/Pages/Share/ShareWrapper";
import {
  getAppSubsystemDeploymentRuntimeUnavailableMessage,
  initializeAppSessionFromCurrentDeployment,
  useAppSubsystemAppModeRoute,
  useAppSubsystemFrontendStatus,
  useAppSubsystemFrontendStatusMessage,
} from "plugins/appSubsystem";
import { createRuntimeAppSubsystemFrontendHost } from "plugins/appSubsystemFrontendHost";
import {
  AppSubsystemRendererHost,
  EMPTY_APP_SUBSYSTEM_RENDERER_PROPS,
} from "plugins/appSubsystemRendererHost";
import {
  usePluginRuntimeBootstrap,
  usePluginRuntimeStore,
} from "plugins/runtime";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  createBrowserRouter,
  Navigate,
  useLocation,
  useParams,
} from "react-router-dom";
import { initializeServerMode } from "state/actions/serverMode";
import { openWebSocket } from "state/actions/websocketReceive";
import {
  useAllProjectMetadata,
  useServerMode,
  useSettings,
  useShareSession,
} from "state/definitions";
import {
  HOME_ROUTER_PATH,
  INDEX_ROUTER_PATH,
  PROJECT_CHAT_STANDALONE_ROUTER_PATH,
  PROJECT_CHAT_THREAD_STANDALONE_ROUTER_PATH,
  PROJECT_CONFIG_ROUTER_PATH,
  SECTION_STANDALONE_ROUTER_PATH,
  VIEW_MODE_ROUTER_PATH,
  WINDOW_SPACE_STANDALONE_ROUTER_PATH,
  WORKSPACE_LAUNCH_ROUTER_PATH,
} from "utils/constants";
import {
  resolveWorkspaceLaunchRouteKind,
  type WorkspaceLaunchRouteKind,
} from "utils/serverModeBoundaryPolicy";
import type { ResolvedServerMode } from "utils/serverModeTypes";
import { resolveDefaultProjectConfigName } from "./defaultProjectRouting";
import { GlobalWrapper, IndexRouteComponent } from "./GlobalWrapper";
import {
  resolveModeElementForServerMode,
  type ModeRouteElements,
} from "./modeRouteResolver";
import { MainContainer } from "./Project/MainContainer";
import { ShareStandaloneProjectSurfacePage } from "./Project/ShareStandaloneProjectSurfacePage";
import { StandaloneProjectSurfacePage } from "./Project/StandaloneProjectSurfacePage";
import { APP_ROUTE_IDS } from "./routeConfig";

function GridContainer({ children }: { children: ReactNode }) {
  return (
    <section className="grid min-h-0 w-screen flex-1 grid-cols-[1fr] grid-rows-[min-content_1fr_min-content] overflow-hidden">
      {children}
    </section>
  );
}

function ProjectRootRedirect() {
  const { projectConfigName } = useParams();
  if (!projectConfigName) {
    return <Navigate to={HOME_ROUTER_PATH} replace />;
  }
  return <Navigate to={`/${encodeURIComponent(projectConfigName)}`} replace />;
}

function resolveShareHomeContent(doneLoading: boolean, is404: boolean) {
  if (!doneLoading) {
    return <LoadingSpinner />;
  }
  if (is404) {
    return <NotFound />;
  }
  return <HomePage />;
}

function ShareIndexRedirect() {
  const showDefaultConfigOnLoad = useSettings(
    (x) => x.backend.showDefaultConfigOnLoad,
  );
  const { defaultProjectConfigId, projectMetadata } = useAllProjectMetadata(
    (x) => x,
  );
  const defaultProjectConfigName = resolveDefaultProjectConfigName(
    defaultProjectConfigId,
    projectMetadata,
  );

  if (
    !defaultProjectConfigId ||
    !showDefaultConfigOnLoad ||
    !defaultProjectConfigName
  ) {
    return <Navigate to={HOME_ROUTER_PATH} replace />;
  }

  return <Navigate to={defaultProjectConfigName} replace />;
}

type ModeWrapperProps = ModeRouteElements;

function ModeWrapper({ ide, share, app, launcher }: ModeWrapperProps) {
  const { mode, modeResolved, modeError } = useServerMode((x) => x);

  useEffect(() => {
    if (!modeResolved) {
      void initializeServerMode();
    }
  }, [modeResolved]);

  if (!modeResolved) {
    return (
      <AppShell
        isLoading
        loadingContent={
          <div className="flex flex-col items-center gap-3 text-xs text-setta-500 dark:text-setta-200">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-setta-500/70 border-t-transparent dark:border-setta-600 dark:border-t-transparent" />
            <p>Checking server mode...</p>
          </div>
        }
      >
        <div />
      </AppShell>
    );
  }

  if (modeError) {
    return (
      <AppShell isLoading={false} loadingContent={null}>
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-xl rounded-2xl border border-setta-200 bg-white p-6 text-setta-900 shadow-sm dark:border-setta-800 dark:bg-setta-950 dark:text-setta-50">
            <h1 className="text-base font-semibold">Unable to load app</h1>
            <p className="mt-2 text-sm text-setta-600 dark:text-setta-300">
              {modeError}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                className="rounded-lg bg-setta-900 px-4 py-2 text-sm font-semibold text-white hover:bg-setta-800 dark:bg-setta-200 dark:text-setta-950 dark:hover:bg-setta-300"
                onClick={() => {
                  useServerMode.setState({
                    mode: null,
                    modeResolved: false,
                    modeError: null,
                  });
                }}
              >
                Retry
              </button>
              <p className="text-xs text-setta-500 dark:text-setta-400">
                Make sure the backend is running and reachable.
              </p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return resolveModeElementForServerMode(mode, {
    ide,
    share,
    app,
    launcher,
  });
}

const ideHomeRouteElement = (
  <GlobalWrapper>
    <ModalContainer>
      <HeaderContainer path={HOME_ROUTER_PATH} />
      <GridContainer>
        <HomePage />
      </GridContainer>
    </ModalContainer>
  </GlobalWrapper>
);

const ideIndexRouteElement = (
  <GlobalWrapper>
    <IndexRouteComponent />
  </GlobalWrapper>
);

const ideProjectRouteElement = (
  <GlobalWrapper>
    <ModalContainer>
      <HeaderContainer path={PROJECT_CONFIG_ROUTER_PATH} />
      <GridContainer>
        <MainContainer />
      </GridContainer>
    </ModalContainer>
  </GlobalWrapper>
);

const ideStandaloneProjectRouteElement = (
  <GlobalWrapper>
    <ModalContainer>
      <StandaloneProjectSurfacePage />
    </ModalContainer>
  </GlobalWrapper>
);

const shareStandaloneProjectRouteElement = (
  <ShareStandaloneProjectSurfacePage />
);

const ideWorkspaceLaunchRouteElement = (
  <GlobalWrapper>
    <WorkspaceLaunchPage />
  </GlobalWrapper>
);

const launcherWorkspaceLaunchRouteElement = (
  <AppShell isLoading={false} loadingContent={null}>
    <WorkspaceLaunchPage />
  </AppShell>
);

const launcherHomeRouteElement = (
  <AppShell isLoading={false} loadingContent={null}>
    <ModalContainer>
      <HeaderContainer path={HOME_ROUTER_PATH} />
      <GridContainer>
        <LauncherHomePage />
      </GridContainer>
    </ModalContainer>
  </AppShell>
);

const shareProjectRouteElement = (
  <ShareWrapper>
    {({ doneLoading, is404 }: { doneLoading: boolean; is404: boolean }) => (
      <ModalContainer>
        <HeaderContainer path={PROJECT_CONFIG_ROUTER_PATH} />
        <GridContainer>
          <ShareMainContainer doneLoading={doneLoading} is404={is404} />
        </GridContainer>
      </ModalContainer>
    )}
  </ShareWrapper>
);

function AppModeUnavailableRoute({ message }: { message: string }) {
  return (
    <AppShell isLoading={false} loadingContent={null}>
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-xl rounded-2xl border border-setta-200 bg-white p-6 text-setta-900 shadow-sm dark:border-setta-800 dark:bg-setta-950 dark:text-setta-50">
          <h1 className="text-base font-semibold">App Mode Unavailable</h1>
          <p className="mt-2 text-sm text-setta-600 dark:text-setta-300">
            {message}
          </p>
        </div>
      </div>
    </AppShell>
  );
}

type AppModeInitializationState = {
  key: string | null;
  message: string | null;
  status: "idle" | "loading" | "ready" | "error";
};

const INITIAL_APP_MODE_INITIALIZATION_STATE: AppModeInitializationState = {
  key: null,
  message: null,
  status: "idle",
};

type AppModeRouteRegistration = ReturnType<typeof useAppSubsystemAppModeRoute>;
type AppSubsystemCapabilities = Parameters<
  typeof getAppSubsystemDeploymentRuntimeUnavailableMessage
>[0];

function resolveAppModeInitializationKey(
  appModeRoute: AppModeRouteRegistration,
  appSubsystemCapabilities: AppSubsystemCapabilities,
) {
  const pluginId = appSubsystemCapabilities?.pluginId;
  if (!appModeRoute || !pluginId) {
    return null;
  }
  return pluginId;
}

function resolveAppModeUnavailableMessage({
  appSubsystemCapabilities,
  appSubsystemStatus,
  appSubsystemStatusMessage,
  initializationState,
  runtimeStatus,
  runtimeStatusMessage,
}: {
  appSubsystemCapabilities: AppSubsystemCapabilities;
  appSubsystemStatus: string;
  appSubsystemStatusMessage: string | null;
  initializationState: AppModeInitializationState;
  runtimeStatus: string;
  runtimeStatusMessage: string | null;
}) {
  if (runtimeStatus === "error") {
    return (
      runtimeStatusMessage ?? "Failed to load the plugin runtime for app mode."
    );
  }
  if (appSubsystemStatus === "error") {
    return (
      appSubsystemStatusMessage ??
      "Failed to load the app subsystem frontend registration."
    );
  }
  if (initializationState.status === "error") {
    return (
      initializationState.message ??
      "Unable to load the current app deployment."
    );
  }
  return getAppSubsystemDeploymentRuntimeUnavailableMessage(
    appSubsystemCapabilities,
  );
}

function useAppModeInitialization({
  appModeRoute,
  appSubsystemCapabilities,
  appSubsystemHost,
  appSubsystemStatus,
  runtimeStatus,
}: {
  appModeRoute: AppModeRouteRegistration;
  appSubsystemCapabilities: AppSubsystemCapabilities;
  appSubsystemHost: ReturnType<typeof createRuntimeAppSubsystemFrontendHost>;
  appSubsystemStatus: string;
  runtimeStatus: string;
}) {
  const [initializationState, setInitializationState] =
    useState<AppModeInitializationState>(INITIAL_APP_MODE_INITIALIZATION_STATE);
  const initializationKey = resolveAppModeInitializationKey(
    appModeRoute,
    appSubsystemCapabilities,
  );
  const shouldInitialize =
    runtimeStatus === "loaded" &&
    appSubsystemStatus === "loaded" &&
    initializationKey !== null;

  useEffect(() => {
    if (!shouldInitialize || initializationKey === null) {
      setInitializationState(INITIAL_APP_MODE_INITIALIZATION_STATE);
      return;
    }

    let cancelled = false;
    setInitializationState({
      key: initializationKey,
      message: null,
      status: "loading",
    });
    void (async () => {
      const initialized = await initializeAppSessionFromCurrentDeployment(
        appSubsystemHost,
      ).catch(() => false);
      if (cancelled) {
        return;
      }
      setInitializationState({
        key: initializationKey,
        message: initialized
          ? null
          : "Unable to load the current app deployment.",
        status: initialized ? "ready" : "error",
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [appSubsystemHost, initializationKey, shouldInitialize]);

  return { initializationKey, initializationState };
}

function useAppModeWebSocket({
  pathname,
  shareSessionId,
  status,
}: {
  pathname: string;
  shareSessionId: string | null;
  status: AppModeInitializationState["status"];
}) {
  useEffect(() => {
    if (status !== "ready" || !shareSessionId) {
      return;
    }
    openWebSocket(pathname, shareSessionId);
  }, [pathname, shareSessionId, status]);
}

export function AppModeRouteElement() {
  usePluginRuntimeBootstrap(true);
  const appSubsystemHost = useMemo(
    () => createRuntimeAppSubsystemFrontendHost(),
    [],
  );
  const location = useLocation();
  const runtimeStatus = usePluginRuntimeStore((state) => state.status);
  const runtimeStatusMessage = usePluginRuntimeStore(
    (state) => state.statusMessage,
  );
  const appSubsystemCapabilities = usePluginRuntimeStore(
    (state) => state.appSubsystemCapabilities,
  );
  const appSubsystemStatus = useAppSubsystemFrontendStatus();
  const appSubsystemStatusMessage = useAppSubsystemFrontendStatusMessage();
  const appModeRoute = useAppSubsystemAppModeRoute();
  const shareSessionId = useShareSession((state) => state.shareSessionId);
  const { initializationKey, initializationState } = useAppModeInitialization({
    appModeRoute,
    appSubsystemCapabilities,
    appSubsystemHost,
    appSubsystemStatus,
    runtimeStatus,
  });
  useAppModeWebSocket({
    pathname: location.pathname,
    shareSessionId,
    status: initializationState.status,
  });

  if (
    appModeRoute &&
    initializationState.status === "ready" &&
    initializationState.key === initializationKey
  ) {
    return (
      <AppSubsystemRendererHost
        renderer={appModeRoute.renderer}
        props={EMPTY_APP_SUBSYSTEM_RENDERER_PROPS}
        host={appSubsystemHost}
        className="contents"
        testId="app-subsystem-app-mode-route"
      />
    );
  }

  if (
    runtimeStatus === "idle" ||
    runtimeStatus === "loading" ||
    appSubsystemStatus === "loading" ||
    (appModeRoute && initializationState.status !== "error")
  ) {
    return <LoadingSpinner />;
  }

  const message = resolveAppModeUnavailableMessage({
    appSubsystemCapabilities,
    appSubsystemStatus,
    appSubsystemStatusMessage,
    initializationState,
    runtimeStatus,
    runtimeStatusMessage,
  });

  return <AppModeUnavailableRoute message={message} />;
}

const appRouteElement = <AppModeRouteElement />;

const shareHomeRouteElement = (
  <ShareWrapper mode="home">
    {({ doneLoading, is404 }: { doneLoading: boolean; is404: boolean }) => (
      <ModalContainer>
        <HeaderContainer path={HOME_ROUTER_PATH} />
        <GridContainer>
          {resolveShareHomeContent(doneLoading, is404)}
        </GridContainer>
      </ModalContainer>
    )}
  </ShareWrapper>
);

const shareIndexRouteElement = (
  <ShareWrapper mode="home">
    {({ doneLoading, is404 }: { doneLoading: boolean; is404: boolean }) => {
      if (!doneLoading) {
        return <LoadingSpinner />;
      }
      if (is404) {
        return <NotFound />;
      }
      return <ShareIndexRedirect />;
    }}
  </ShareWrapper>
);

const ideNotFoundRouteElement = (
  <GlobalWrapper>
    <ModalContainer>
      <HeaderContainer path={HOME_ROUTER_PATH} />
      <GridContainer>
        <NotFound />
      </GridContainer>
    </ModalContainer>
  </GlobalWrapper>
);

const shareNotFoundRouteElement = (
  <ShareWrapper mode="home">
    {({ doneLoading }: { doneLoading: boolean; is404: boolean }) => (
      <ModalContainer>
        <HeaderContainer path={HOME_ROUTER_PATH} />
        <GridContainer>
          {doneLoading ? <NotFound /> : <LoadingSpinner />}
        </GridContainer>
      </ModalContainer>
    )}
  </ShareWrapper>
);

const indexRoute = {
  id: APP_ROUTE_IDS.index,
  path: INDEX_ROUTER_PATH,
  element: (
    <ModeWrapper
      ide={ideIndexRouteElement}
      share={shareIndexRouteElement}
      app={appRouteElement}
      launcher={launcherHomeRouteElement}
    />
  ),
};

const homeRoute = {
  id: APP_ROUTE_IDS.home,
  path: HOME_ROUTER_PATH,
  element: (
    <ModeWrapper
      ide={ideHomeRouteElement}
      share={shareHomeRouteElement}
      app={appRouteElement}
      launcher={launcherHomeRouteElement}
    />
  ),
};

const projectRoute = {
  id: APP_ROUTE_IDS.project,
  path: PROJECT_CONFIG_ROUTER_PATH,
  element: (
    <ModeWrapper
      ide={ideProjectRouteElement}
      share={shareProjectRouteElement}
      app={appRouteElement}
      launcher={<Navigate to={HOME_ROUTER_PATH} replace />}
    />
  ),
};

const viewModeRoute = {
  id: APP_ROUTE_IDS.viewMode,
  path: VIEW_MODE_ROUTER_PATH,
  element: (
    <ModeWrapper
      ide={ideProjectRouteElement}
      share={shareProjectRouteElement}
      app={appRouteElement}
      launcher={<Navigate to={HOME_ROUTER_PATH} replace />}
    />
  ),
};

const projectChatStandaloneRoute = {
  id: APP_ROUTE_IDS.projectChatStandalone,
  path: PROJECT_CHAT_STANDALONE_ROUTER_PATH,
  element: (
    <ModeWrapper
      ide={ideStandaloneProjectRouteElement}
      share={shareStandaloneProjectRouteElement}
      app={appRouteElement}
      launcher={<ProjectRootRedirect />}
    />
  ),
};

const projectChatThreadStandaloneRoute = {
  id: APP_ROUTE_IDS.projectChatThreadStandalone,
  path: PROJECT_CHAT_THREAD_STANDALONE_ROUTER_PATH,
  element: (
    <ModeWrapper
      ide={ideStandaloneProjectRouteElement}
      share={shareStandaloneProjectRouteElement}
      app={appRouteElement}
      launcher={<ProjectRootRedirect />}
    />
  ),
};

const windowSpaceStandaloneRoute = {
  id: APP_ROUTE_IDS.windowSpaceStandalone,
  path: WINDOW_SPACE_STANDALONE_ROUTER_PATH,
  element: (
    <ModeWrapper
      ide={ideStandaloneProjectRouteElement}
      share={shareStandaloneProjectRouteElement}
      app={appRouteElement}
      launcher={<ProjectRootRedirect />}
    />
  ),
};

const sectionStandaloneRoute = {
  id: APP_ROUTE_IDS.sectionStandalone,
  path: SECTION_STANDALONE_ROUTER_PATH,
  element: (
    <ModeWrapper
      ide={ideStandaloneProjectRouteElement}
      share={shareStandaloneProjectRouteElement}
      app={appRouteElement}
      launcher={<ProjectRootRedirect />}
    />
  ),
};

const catchAllRoute = {
  id: APP_ROUTE_IDS.catchAll,
  path: "*",
  element: (
    <ModeWrapper
      ide={ideNotFoundRouteElement}
      share={shareNotFoundRouteElement}
      app={appRouteElement}
      launcher={launcherHomeRouteElement}
    />
  ),
};

const workspaceLaunchBlockedRouteElement = (
  <Navigate to={HOME_ROUTER_PATH} replace />
);

const workspaceLaunchRouteElementsByKind: Record<
  WorkspaceLaunchRouteKind,
  ReactNode
> = {
  ide: ideWorkspaceLaunchRouteElement,
  launcher: launcherWorkspaceLaunchRouteElement,
  blocked: workspaceLaunchBlockedRouteElement,
};

function resolveWorkspaceLaunchRouteElement(mode: ResolvedServerMode) {
  return workspaceLaunchRouteElementsByKind[
    resolveWorkspaceLaunchRouteKind(mode)
  ];
}

const workspaceLaunchRouteElements: ModeRouteElements = {
  ide: resolveWorkspaceLaunchRouteElement("ide"),
  share: resolveWorkspaceLaunchRouteElement("share"),
  app: resolveWorkspaceLaunchRouteElement("app"),
  launcher: resolveWorkspaceLaunchRouteElement("launcher"),
};

const workspaceLaunchRoute = {
  id: APP_ROUTE_IDS.workspaceLaunch,
  path: WORKSPACE_LAUNCH_ROUTER_PATH,
  element: <ModeWrapper {...workspaceLaunchRouteElements} />,
};

const appRoutes = [
  indexRoute,
  homeRoute,
  workspaceLaunchRoute,
  projectChatThreadStandaloneRoute,
  projectChatStandaloneRoute,
  windowSpaceStandaloneRoute,
  viewModeRoute,
  sectionStandaloneRoute,
  projectRoute,
  catchAllRoute,
];

export const router = createBrowserRouter(appRoutes);
