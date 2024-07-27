import { HeaderContainer } from "components/AppContainer/Header/Header";
import { HomePage } from "components/HomePage/HomePage";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { ROOT_ROUTER_PATH } from "utils/constants";
import { GlobalWrapper } from "./GlobalWrapper";

function IndexWrapper() {
  return (
    <>
      <HeaderContainer path={ROOT_ROUTER_PATH} />
      <GridContainer>
        <HomePage />
      </GridContainer>
    </>
  );
}

export const indexRoute = {
  path: ROOT_ROUTER_PATH,
  element: (
    <GlobalWrapper>
      <IndexWrapper />
    </GlobalWrapper>
  ),
};
