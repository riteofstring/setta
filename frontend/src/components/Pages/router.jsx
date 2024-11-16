import { HeaderContainer } from "components/AppHeader/Header";
import { ModalContainer } from "components/Modals/ModalContainer";
import { HomePage } from "components/Pages/Home/HomePage";
import { GridContainer } from "components/Utils/atoms/gridContainer/GridContainer";
import { createBrowserRouter } from "react-router-dom";
import {
  HOME_ROUTER_PATH,
  INDEX_ROUTER_PATH,
  NOT_FOUND_ROUTER_PATH,
  PROJECT_CONFIG_ROUTER_PATH,
} from "utils/constants";
import { GlobalWrapper, IndexRouteComponent } from "./GlobalWrapper";
import { MainContainer } from "./Project/MainContainer";

function HomeRouteElement() {
  return (
    <GlobalWrapper>
      <HeaderContainer path={HOME_ROUTER_PATH} />
      <GridContainer>
        <HomePage />
      </GridContainer>
    </GlobalWrapper>
  );
}

const homeRoute = {
  path: HOME_ROUTER_PATH,
  element: <HomeRouteElement />,
};

const notFoundRoute = {
  path: NOT_FOUND_ROUTER_PATH,
  element: <HomeRouteElement />,
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

export const router = createBrowserRouter([
  indexRoute,
  homeRoute,
  notFoundRoute,
  projectRoute,
]);
