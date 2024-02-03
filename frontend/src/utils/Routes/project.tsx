import { HeaderContainer } from "components/AppContainer/Header/Header";
import { MainContainer } from "components/AppContainer/Main/MainContainer";
import { RouteObject } from "react-router-dom";
import { ReactFlowProvider } from "xyflow/core";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { ModalContainer } from "utils/Modals/ModalContainer";
import { GlobalWrapper } from "./GlobalWrapper";

const PATH = ":projectName/:configName";

function ProjectWrapper() {
  return (
    <ModalContainer>
      <ReactFlowProvider>
        <HeaderContainer path={PATH} />
        <GridContainer>
          <MainContainer />
        </GridContainer>
      </ReactFlowProvider>
    </ModalContainer>
  );
}

export const projectRoute: RouteObject = {
  path: PATH,
  element: (
    <GlobalWrapper>
      <ProjectWrapper />
    </GlobalWrapper>
  ),
};
