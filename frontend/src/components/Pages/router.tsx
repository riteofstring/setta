import { HeaderContainer } from "components/AppHeader/Header";
import { ModalContainer } from "components/Modals/ModalContainer";
import { AppShell } from "components/Pages/AppShell";
import { HomePage } from "components/Pages/Home/HomePage";
import { LoadingSpinner } from "components/Pages/LoadingSpinner";
import { NotFound } from "components/Pages/NotFound/NotFound";
import { ShareMainContainer } from "components/Pages/Share/ShareMainContainer";
import { ShareWrapper } from "components/Pages/Share/ShareWrapper";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { initializeShareSessionFromCurrentDeployment } from "state/actions/share";
import {
  useAllProjectMetadata,
  useServerMode,
  useSettings,
} from "state/definitions";
import {
  HOME_ROUTER_PATH,
  INDEX_ROUTER_PATH,
  PROJECT_CONFIG_ROUTER_PATH,
} from "utils/constants";
import type { ProjectConfig } from "utils/generatedTypes";
import { GlobalWrapper, IndexRouteComponent } from "./GlobalWrapper";
import { MainContainer } from "./Project/MainContainer";

function GridContainer({ children }) {
  return (
    <section className="grid min-h-0 w-screen flex-1 grid-cols-[1fr] grid-rows-[min-content_1fr] overflow-hidden">
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

type ModeWrapperProps = {
  ide: ReactNode;
  share: ReactNode;
};

function ModeWrapper({ ide, share }: ModeWrapperProps) {
  const { isShareServer, modeResolved } = useServerMode((x) => x);

  useEffect(() => {
    if (!modeResolved) {
      void initializeShareSessionFromCurrentDeployment();
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

  return isShareServer ? share : ide;
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

const indexRoute = {
  path: INDEX_ROUTER_PATH,
  element: (
    <ModeWrapper ide={ideIndexRouteElement} share={shareIndexRouteElement} />
  ),
};

const homeRoute = {
  path: HOME_ROUTER_PATH,
  element: (
    <ModeWrapper ide={ideHomeRouteElement} share={shareHomeRouteElement} />
  ),
};

const projectRoute = {
  path: PROJECT_CONFIG_ROUTER_PATH,
  element: (
    <ModeWrapper
      ide={ideProjectRouteElement}
      share={shareProjectRouteElement}
    />
  ),
};

export const router = createBrowserRouter([
  indexRoute,
  homeRoute,
  projectRoute,
]);
