import { HeaderContainer } from "components/AppContainer/Header/Header";
import { HomePage } from "components/HomePage/HomePage";
import { RouteObject } from "react-router-dom";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { GlobalWrapper } from "./GlobalWrapper";

const PATH = "/";

function IndexWrapper() {
  return (
    <>
      <HeaderContainer path={PATH} />
      <GridContainer>
        <HomePage />
      </GridContainer>
    </>
  );
}

export const indexRoute: RouteObject = {
  path: PATH,
  element: (
    <GlobalWrapper>
      <IndexWrapper />
    </GlobalWrapper>
  ),
};
