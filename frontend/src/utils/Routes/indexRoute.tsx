import { HeaderContainer } from "components/AppContainer/Header/Header";
import { HomePage } from "components/HomePage/HomePage";
import { RouteObject } from "react-router-dom";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { GlobalWrapper } from "./GlobalWrapper";

function IndexWrapper() {
  return (
    <>
      <HeaderContainer />
      <GridContainer>
        <HomePage />
      </GridContainer>
    </>
  );
}

export const indexRoute: RouteObject = {
  path: "/",
  element: (
    <GlobalWrapper>
      <IndexWrapper />
    </GlobalWrapper>
  ),
};
