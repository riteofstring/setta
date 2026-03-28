import { HeaderContainer } from "components/AppHeader/Header";
import { ModalContainer } from "components/Modals/ModalContainer";
import { AppShell } from "components/Pages/AppShell";
import { LauncherHomePage } from "components/Pages/Launcher/LauncherHomePage";
import { LoadingSpinner } from "components/Pages/LoadingSpinner";
import type { ReactNode } from "react";
import { lazy, Suspense, useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { initializeServerMode } from "state/actions/serverMode";
import { useServerMode } from "state/definitions";
import { HOME_ROUTER_PATH } from "utils/constants";
import {
  ModeWrappedRouteGridContainer,
  buildModeWrappedHomeProjectCatchAllRouteElements,
} from "./modeWrappedHomeProjectCatchAllRouteElements";
import { buildModeWrappedIndexWorkspaceLaunchRouteElements } from "./modeWrappedIndexWorkspaceLaunchRouteElements";
import {
  resolveModeElementForServerMode,
  type ModeRouteElements,
} from "./modeRouteResolver";
import { createModeWrappedBrowserRouter } from "./modeWrappedBrowserRouter";

const LazyAppWrapper = lazy(async () => {
  const mod = await import("components/Pages/App/AppWrapper");
  return { default: mod.AppWrapper };
});

const LazyAppMainContainer = lazy(async () => {
  const mod = await import("components/Pages/App/AppMainContainer");
  return { default: mod.AppMainContainer };
});

function ProjectRootRedirect() {
  const { projectConfigName } = useParams();
  if (!projectConfigName) {
    return <Navigate to={HOME_ROUTER_PATH} replace />;
  }
  return <Navigate to={`/${encodeURIComponent(projectConfigName)}`} replace />;
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

const launcherHomeRouteElement = (
  <AppShell isLoading={false} loadingContent={null}>
    <ModalContainer>
      <HeaderContainer path={HOME_ROUTER_PATH} />
      <ModeWrappedRouteGridContainer>
        <LauncherHomePage />
      </ModeWrappedRouteGridContainer>
    </ModalContainer>
  </AppShell>
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

const {
  homeRouteElements,
  projectRouteElements,
  catchAllRouteElements,
} = buildModeWrappedHomeProjectCatchAllRouteElements({
  appRouteElement,
  launcherHomeRouteElement,
});
const { indexRouteElements, workspaceLaunchRouteElements } =
  buildModeWrappedIndexWorkspaceLaunchRouteElements({
    appRouteElement,
    launcherHomeRouteElement,
  });

export const router = createModeWrappedBrowserRouter({
  renderModeElement: (routeElements) => <ModeWrapper {...routeElements} />,
  indexRouteElements,
  homeRouteElements,
  workspaceLaunchRouteElements,
  projectRouteElements,
  viewModeRouteElements: projectRouteElements,
  catchAllRouteElements,
  standaloneAppRouteElement: appRouteElement,
  standaloneLauncherRouteElement: <ProjectRootRedirect />,
});
