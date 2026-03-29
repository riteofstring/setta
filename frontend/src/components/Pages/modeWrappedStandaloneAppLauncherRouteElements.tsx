import { HeaderContainer } from "components/AppHeader/Header";
import { ModalContainer } from "components/Modals/ModalContainer";
import { AppShell } from "components/Pages/AppShell";
import { LauncherHomePage } from "components/Pages/Launcher/LauncherHomePage";
import { LoadingSpinner } from "components/Pages/LoadingSpinner";
import type { ReactNode } from "react";
import { lazy, memo, Suspense } from "react";
import { Navigate, useParams } from "react-router-dom";
import { HOME_ROUTER_PATH } from "utils/constants";
import { ModeWrappedRouteGridContainer } from "./modeWrappedHomeProjectCatchAllRouteElements";

type AppWrapperRenderState = {
  doneLoading: boolean;
  is404: boolean;
};

type ModeWrappedStandaloneAppLauncherRouteElements = {
  appRouteElement: ReactNode;
  launcherHomeRouteElement: ReactNode;
  standaloneAppRouteElement: ReactNode;
  standaloneLauncherRouteElement: ReactNode;
};

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

function _LauncherHomeRouteElement() {
  return (
    <AppShell isLoading={false} loadingContent={null}>
      <ModalContainer>
        <HeaderContainer path={HOME_ROUTER_PATH} />
        <ModeWrappedRouteGridContainer>
          <LauncherHomePage />
        </ModeWrappedRouteGridContainer>
      </ModalContainer>
    </AppShell>
  );
}

const LauncherHomeRouteElement = memo(_LauncherHomeRouteElement);

const appRouteElement = (
  <Suspense fallback={<LoadingSpinner />}>
    <LazyAppWrapper>
      {({ doneLoading, is404 }: AppWrapperRenderState) => (
        <LazyAppMainContainer doneLoading={doneLoading} is404={is404} />
      )}
    </LazyAppWrapper>
  </Suspense>
);

const launcherHomeRouteElement = <LauncherHomeRouteElement />;

export function buildModeWrappedStandaloneAppLauncherRouteElements(): ModeWrappedStandaloneAppLauncherRouteElements {
  return {
    appRouteElement,
    launcherHomeRouteElement,
    standaloneAppRouteElement: appRouteElement,
    standaloneLauncherRouteElement: <ProjectRootRedirect />,
  };
}
