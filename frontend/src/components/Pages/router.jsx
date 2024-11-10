import { HeaderContainer } from "components/AppHeader/Header";
import { ModalContainer } from "components/Modals/ModalContainer";
import { HomePage } from "components/Pages/Home/HomePage";
import { Settings } from "components/Pages/Settings/Settings";
import { GridContainer } from "components/Utils/atoms/gridContainer/GridContainer";
import { createBrowserRouter } from "react-router-dom";
import {
  HOME_ROUTER_PATH,
  PROJECT_CONFIG_ROUTER_PATH,
  SETTINGS_ROUTER_PATH,
} from "utils/constants";
import { GlobalWrapper } from "./GlobalWrapper";
import { MainContainer } from "./Project/MainContainer";

const homeRoute = {
  path: HOME_ROUTER_PATH,
  element: (
    <GlobalWrapper>
      <HeaderContainer path={HOME_ROUTER_PATH} />
      <GridContainer>
        <HomePage />
      </GridContainer>
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

const settingsRoute = {
  path: SETTINGS_ROUTER_PATH,
  element: (
    <GlobalWrapper>
      <HeaderContainer path={SETTINGS_ROUTER_PATH} />
      <GridContainer>
        <Settings />
      </GridContainer>
    </GlobalWrapper>
  ),
};

export const router = createBrowserRouter([
  homeRoute,
  projectRoute,
  settingsRoute,
]);
