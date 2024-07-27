import { HeaderContainer } from "components/AppContainer/Header/Header";
import { MainContainer } from "components/AppContainer/Main/MainContainer";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { ModalContainer } from "utils/Modals/ModalContainer";
import { GlobalWrapper } from "./GlobalWrapper";

const PATH = ":projectName/:configName";

function ProjectWrapper() {
  return (
    <ModalContainer>
      <HeaderContainer path={PATH} />
      <GridContainer>
        <MainContainer />
      </GridContainer>
    </ModalContainer>
  );
}

export const projectRoute = {
  path: PATH,
  element: (
    <GlobalWrapper>
      <ProjectWrapper />
    </GlobalWrapper>
  ),
};
