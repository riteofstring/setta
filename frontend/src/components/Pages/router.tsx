import { HeaderContainer } from "components/AppHeader/Header";
import { ModalContainer } from "components/Modals/ModalContainer";
import { HomePage } from "components/Pages/Home/HomePage";
import { ShareMainContainer } from "components/Pages/Share/ShareMainContainer";
import { ShareWrapper } from "components/Pages/Share/ShareWrapper";
import { createBrowserRouter } from "react-router-dom";
import {
  HOME_ROUTER_PATH,
  INDEX_ROUTER_PATH,
  PROJECT_CONFIG_ROUTER_PATH,
  SHARE_PROJECT_ROUTER_PATH,
  SHARE_PROJECT_VERSION_ROUTER_PATH,
  SHARE_PROJECT_VERSION_CONFIG_ROUTER_PATH,
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

const shareRouteElement = (
  <ShareWrapper>
    <ModalContainer>
      <HeaderContainer path={SHARE_PROJECT_ROUTER_PATH} />
      <GridContainer>
        <ShareMainContainer />
      </GridContainer>
    </ModalContainer>
  </ShareWrapper>
);

const shareRoutes = [
  {
    path: SHARE_PROJECT_ROUTER_PATH,
    element: shareRouteElement,
  },
  {
    path: SHARE_PROJECT_VERSION_CONFIG_ROUTER_PATH,
    element: shareRouteElement,
  },
  {
    path: SHARE_PROJECT_VERSION_ROUTER_PATH,
    element: shareRouteElement,
  },
];

export const router = createBrowserRouter([
  indexRoute,
  homeRoute,
  projectRoute,
  ...shareRoutes,
]);
