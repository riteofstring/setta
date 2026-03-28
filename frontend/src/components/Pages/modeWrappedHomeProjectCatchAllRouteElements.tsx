import { HeaderContainer } from "components/AppHeader/Header";
import { ModalContainer } from "components/Modals/ModalContainer";
import { HomePage } from "components/Pages/Home/HomePage";
import { LoadingSpinner } from "components/Pages/LoadingSpinner";
import { NotFound } from "components/Pages/NotFound/NotFound";
import { ShareMainContainer } from "components/Pages/Share/ShareMainContainer";
import { ShareWrapper } from "components/Pages/Share/ShareWrapper";
import { SectionContainerBoundary } from "components/Section/Container/SectionContainerBoundary";
import type { ReactNode } from "react";
import { memo } from "react";
import { Navigate } from "react-router-dom";
import { HOME_ROUTER_PATH, PROJECT_CONFIG_ROUTER_PATH } from "utils/constants";
import { GlobalWrapper } from "./GlobalWrapper";
import type { BuildModeWrappedAppRouteStackArgs } from "./modeWrappedAppRouteStack";
import { MainContainer } from "./Project/MainContainer";

type ShareRouteRenderState = {
  doneLoading: boolean;
  is404: boolean;
};

type BuildModeWrappedHomeProjectCatchAllRouteElementsArgs = {
  appRouteElement: ReactNode;
  launcherHomeRouteElement: ReactNode;
};

type ModeWrappedHomeProjectCatchAllRouteElements = Pick<
  BuildModeWrappedAppRouteStackArgs,
  "homeRouteElements" | "projectRouteElements" | "catchAllRouteElements"
>;

export function ModeWrappedRouteGridContainer({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <section className="grid min-h-0 w-screen flex-1 grid-cols-[1fr] grid-rows-[min-content_1fr_min-content] overflow-hidden">
      {children}
    </section>
  );
}

function resolveShareHomeContent({
  doneLoading,
  is404,
}: ShareRouteRenderState) {
  if (!doneLoading) {
    return <LoadingSpinner />;
  }
  if (is404) {
    return <NotFound />;
  }
  return <HomePage />;
}

function _IdeHomeRouteElement() {
  return (
    <GlobalWrapper>
      <ModalContainer>
        <HeaderContainer path={HOME_ROUTER_PATH} />
        <ModeWrappedRouteGridContainer>
          <HomePage />
        </ModeWrappedRouteGridContainer>
      </ModalContainer>
    </GlobalWrapper>
  );
}

const IdeHomeRouteElement = memo(_IdeHomeRouteElement);

function _IdeProjectRouteElement() {
  return (
    <GlobalWrapper>
      <ModalContainer>
        <HeaderContainer path={PROJECT_CONFIG_ROUTER_PATH} />
        <ModeWrappedRouteGridContainer>
          <MainContainer SectionBoundary={SectionContainerBoundary} />
        </ModeWrappedRouteGridContainer>
      </ModalContainer>
    </GlobalWrapper>
  );
}

const IdeProjectRouteElement = memo(_IdeProjectRouteElement);

function _ShareProjectRouteElement() {
  return (
    <ShareWrapper>
      {({ doneLoading, is404 }: ShareRouteRenderState) => (
        <ModalContainer>
          <HeaderContainer path={PROJECT_CONFIG_ROUTER_PATH} />
          <ModeWrappedRouteGridContainer>
            <ShareMainContainer
              doneLoading={doneLoading}
              is404={is404}
              SectionBoundary={SectionContainerBoundary}
            />
          </ModeWrappedRouteGridContainer>
        </ModalContainer>
      )}
    </ShareWrapper>
  );
}

const ShareProjectRouteElement = memo(_ShareProjectRouteElement);

function _ShareHomeRouteElement() {
  return (
    <ShareWrapper mode="home">
      {({ doneLoading, is404 }: ShareRouteRenderState) => (
        <ModalContainer>
          <HeaderContainer path={HOME_ROUTER_PATH} />
          <ModeWrappedRouteGridContainer>
            {resolveShareHomeContent({ doneLoading, is404 })}
          </ModeWrappedRouteGridContainer>
        </ModalContainer>
      )}
    </ShareWrapper>
  );
}

const ShareHomeRouteElement = memo(_ShareHomeRouteElement);

function _IdeNotFoundRouteElement() {
  return (
    <GlobalWrapper>
      <ModalContainer>
        <HeaderContainer path={HOME_ROUTER_PATH} />
        <ModeWrappedRouteGridContainer>
          <NotFound />
        </ModeWrappedRouteGridContainer>
      </ModalContainer>
    </GlobalWrapper>
  );
}

const IdeNotFoundRouteElement = memo(_IdeNotFoundRouteElement);

function _ShareNotFoundRouteElement() {
  return (
    <ShareWrapper mode="home">
      {({ doneLoading }: ShareRouteRenderState) => (
        <ModalContainer>
          <HeaderContainer path={HOME_ROUTER_PATH} />
          <ModeWrappedRouteGridContainer>
            {doneLoading ? <NotFound /> : <LoadingSpinner />}
          </ModeWrappedRouteGridContainer>
        </ModalContainer>
      )}
    </ShareWrapper>
  );
}

const ShareNotFoundRouteElement = memo(_ShareNotFoundRouteElement);

export function buildModeWrappedHomeProjectCatchAllRouteElements({
  appRouteElement,
  launcherHomeRouteElement,
}: BuildModeWrappedHomeProjectCatchAllRouteElementsArgs): ModeWrappedHomeProjectCatchAllRouteElements {
  return {
    homeRouteElements: {
      ide: <IdeHomeRouteElement />,
      share: <ShareHomeRouteElement />,
      app: appRouteElement,
      launcher: launcherHomeRouteElement,
    },
    projectRouteElements: {
      ide: <IdeProjectRouteElement />,
      share: <ShareProjectRouteElement />,
      app: appRouteElement,
      launcher: <Navigate to={HOME_ROUTER_PATH} replace />,
    },
    catchAllRouteElements: {
      ide: <IdeNotFoundRouteElement />,
      share: <ShareNotFoundRouteElement />,
      app: appRouteElement,
      launcher: launcherHomeRouteElement,
    },
  };
}
