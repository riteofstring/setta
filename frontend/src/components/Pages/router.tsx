import { HeaderContainer } from "components/AppHeader/Header";
import { ModalContainer } from "components/Modals/ModalContainer";
import { HomePage } from "components/Pages/Home/HomePage";
import { LoadingSpinner } from "components/Pages/LoadingSpinner";
import { NotFound } from "components/Pages/NotFound/NotFound";
import { ShareMainContainer } from "components/Pages/Share/ShareMainContainer";
import { ShareWrapper } from "components/Pages/Share/ShareWrapper";
import { createBrowserRouter } from "react-router-dom";
import {
  HOME_ROUTER_PATH,
  INDEX_ROUTER_PATH,
  PROJECT_CONFIG_ROUTER_PATH,
  SHARE_PROJECT_CONFIG_ROUTER_PATH,
  SHARE_PROJECT_HOME_ROUTER_PATH,
  SHARE_PROJECT_ROUTER_PATH,
} from "utils/constants";
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

const homeRoute = {
  path: HOME_ROUTER_PATH,
  element: (
    <GlobalWrapper>
      <ModalContainer>
        <HeaderContainer path={HOME_ROUTER_PATH} />
        <GridContainer>
          <HomePage />
        </GridContainer>
      </ModalContainer>
    </GlobalWrapper>
  ),
};

const indexRoute = {
  path: INDEX_ROUTER_PATH,
  element: (
    <GlobalWrapper>
      <IndexRouteComponent />
    </GlobalWrapper>
  ),
};

const projectRoute = {
  path: PROJECT_CONFIG_ROUTER_PATH,
  element: (
    <GlobalWrapper>
      <ModalContainer>
        <HeaderContainer path={PROJECT_CONFIG_ROUTER_PATH} />
        <GridContainer>
          <MainContainer />
        </GridContainer>
      </ModalContainer>
    </GlobalWrapper>
  ),
};

const shareProjectRouteElement = (
  <ShareWrapper>
    {({ doneLoading, is404 }: { doneLoading: boolean; is404: boolean }) => (
      <ModalContainer>
        <HeaderContainer path={SHARE_PROJECT_ROUTER_PATH} />
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
        <HeaderContainer path={SHARE_PROJECT_HOME_ROUTER_PATH} />
        <GridContainer>
          {resolveShareHomeContent(doneLoading, is404)}
        </GridContainer>
      </ModalContainer>
    )}
  </ShareWrapper>
);

const shareRoutes = [
  {
    path: SHARE_PROJECT_HOME_ROUTER_PATH,
    element: shareHomeRouteElement,
  },
  {
    path: SHARE_PROJECT_ROUTER_PATH,
    element: shareProjectRouteElement,
  },
  {
    path: SHARE_PROJECT_CONFIG_ROUTER_PATH,
    element: shareProjectRouteElement,
  },
];

export const router = createBrowserRouter([
  indexRoute,
  homeRoute,
  projectRoute,
  ...shareRoutes,
]);
