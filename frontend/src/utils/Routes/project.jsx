import { HeaderContainer } from "components/AppContainer/Header/Header";
import { MainContainer } from "components/AppContainer/Main/MainContainer";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { PROJECT_ROUTER_PATH } from "utils/constants";
import { ModalContainer } from "utils/Modals/ModalContainer";
import { GlobalWrapper } from "./GlobalWrapper";

function ProjectWrapper() {
  return (
    <ModalContainer>
      <HeaderContainer path={PROJECT_ROUTER_PATH} />
      <GridContainer>
        <MainContainer />
      </GridContainer>
    </ModalContainer>
  );
}

export const projectRoute = {
  path: PROJECT_ROUTER_PATH,
  element: (
    <GlobalWrapper>
      <ProjectWrapper />
    </GlobalWrapper>
  ),
};
