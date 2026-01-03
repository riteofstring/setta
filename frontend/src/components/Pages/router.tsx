import { HeaderContainer } from "components/AppHeader/Header";
import { ModalContainer } from "components/Modals/ModalContainer";
import { HomePage } from "components/Pages/Home/HomePage";
import { ShareLanding } from "components/Pages/Share/ShareLanding";
import { ShareMainContainer } from "components/Pages/Share/ShareMainContainer";
import { ShareWrapper } from "components/Pages/Share/ShareWrapper";
import { createBrowserRouter } from "react-router-dom";
import {
  HOME_ROUTER_PATH,
  INDEX_ROUTER_PATH,
  PROJECT_CONFIG_ROUTER_PATH,
  SHARE_DEPLOYMENT_ROUTER_PATH,
} from "utils/constants";
import { SHARE_ROOT_ROUTER_PATH } from "utils/shareRoutes";
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

const shareRoute = {
  path: SHARE_DEPLOYMENT_ROUTER_PATH,
  element: (
    <ShareWrapper>
      <ModalContainer>
        <HeaderContainer path={SHARE_DEPLOYMENT_ROUTER_PATH} />
        <GridContainer>
          <ShareMainContainer />
        </GridContainer>
      </ModalContainer>
    </ShareWrapper>
  ),
};

const shareIndexRoute = {
  path: SHARE_ROOT_ROUTER_PATH,
  element: (
    <ShareWrapper>
      <ShareLanding />
    </ShareWrapper>
  ),
};

export const router = createBrowserRouter([
  indexRoute,
  homeRoute,
  projectRoute,
  shareIndexRoute,
  shareRoute,
]);
