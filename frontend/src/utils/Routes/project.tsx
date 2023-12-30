import { HeaderContainer } from "components/AppContainer/Header/Header";
import { MainContainer } from "components/AppContainer/Main/MainContainer";
import { RouteObject } from "react-router-dom";
import { ReactFlowProvider } from "reactflow";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { ModalContainer } from "utils/Modals/ModalContainer";
import { GlobalWrapper } from "./GlobalWrapper";

function ProjectWrapper() {
  return (
    <ModalContainer>
      <ReactFlowProvider>
        <HeaderContainer />
        <GridContainer>
          <MainContainer />
        </GridContainer>
      </ReactFlowProvider>
    </ModalContainer>
  );
}

export const projectRoute: RouteObject = {
  path: ":projectName/:configName",
  element: (
    <GlobalWrapper>
      <ProjectWrapper />
    </GlobalWrapper>
  ),
};
