import { HeaderContainer } from "components/AppHeader/Header";
import { HomePage } from "components/HomePage/HomePage";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { HOME_ROUTER_PATH } from "utils/constants";
import { GlobalWrapper } from "./GlobalWrapper";

export const homeRoute = {
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
