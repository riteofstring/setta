import { HeaderContainer } from "components/AppHeader/Header";
import { MainContainer } from "components/ProjectPage/MainContainer";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { PROJECT_ROUTER_PATH } from "utils/constants";
import { ModalContainer } from "components/Modals/ModalContainer";
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
