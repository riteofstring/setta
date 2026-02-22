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
import type { ReactNode } from "react";
import { lazy, Suspense, useEffect } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { initializeServerMode } from "state/actions/serverMode";
import {
  useAllProjectMetadata,
  useServerMode,
  useSettings,
} from "state/definitions";
import {
  HOME_ROUTER_PATH,
  INDEX_ROUTER_PATH,
  PROJECT_CONFIG_ROUTER_PATH,
  VIEW_MODE_ROUTER_PATH,
  WORKSPACE_LAUNCH_ROUTER_PATH,
} from "utils/constants";
import type { ProjectConfig } from "utils/generatedTypes";
import { GlobalWrapper, IndexRouteComponent } from "./GlobalWrapper";
import {
  resolveModeElementForServerMode,
  type ModeRouteElements,
} from "./modeRouteResolver";
import { MainContainer } from "./Project/MainContainer";

const LazyAppWrapper = lazy(async () => {
  const mod = await import("components/Pages/App/AppWrapper");
  return { default: mod.AppWrapper };
});

const LazyAppMainContainer = lazy(async () => {
  const mod = await import("components/Pages/App/AppMainContainer");
  return { default: mod.AppMainContainer };
});

function GridContainer({ children }: { children: ReactNode }) {
  return (
    <section className="grid min-h-0 w-screen flex-1 grid-cols-[1fr] grid-rows-[min-content_1fr_min-content] overflow-hidden">
      {children}
    </section>
  );
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

function resolveDefaultProjectConfigName(
  defaultProjectConfigId: string | null,
  projectMetadata: Array<ProjectConfig>,
): string | null {
  if (!defaultProjectConfigId) {
    return null;
  }
  for (const config of projectMetadata) {
    if (config.id === defaultProjectConfigId) {
      return config.name;
    }
  }
  return null;
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

const ideWorkspaceLaunchRouteElement = (
  <GlobalWrapper>
    <WorkspaceLaunchPage />
  </GlobalWrapper>
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

const appRouteElement = (
  <Suspense fallback={<LoadingSpinner />}>
    <LazyAppWrapper>
      {({ doneLoading, is404 }: { doneLoading: boolean; is404: boolean }) => (
        <LazyAppMainContainer doneLoading={doneLoading} is404={is404} />
      )}
    </LazyAppWrapper>
  </Suspense>
);

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

const catchAllRoute = {
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

const workspaceLaunchRoute = {
  path: WORKSPACE_LAUNCH_ROUTER_PATH,
  element: (
    <ModeWrapper
      ide={ideWorkspaceLaunchRouteElement}
      share={<Navigate to={HOME_ROUTER_PATH} replace />}
      app={<Navigate to={HOME_ROUTER_PATH} replace />}
      launcher={<Navigate to={HOME_ROUTER_PATH} replace />}
    />
  ),
};

export const router = createBrowserRouter([
  indexRoute,
  homeRoute,
  workspaceLaunchRoute,
  viewModeRoute,
  projectRoute,
  catchAllRoute,
]);
