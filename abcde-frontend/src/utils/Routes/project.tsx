import HeaderContainer from "components/AppContainer/Header/Header";
import MainContainer from "components/AppContainer/Main/MainContainer";
import { ReactFlowProvider } from "react-flow-renderer";
import { RouteObject } from "react-router-dom";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { GlobalWrapper } from "./GlobalWrapper";

function ProjectWrapper() {
  return (
    <ReactFlowProvider>
      <HeaderContainer />
      <GridContainer>
        <MainContainer />
      </GridContainer>
    </ReactFlowProvider>
  );
}

export const projectRoute: RouteObject = {
  path: ":username/:projectName/:configName",
  element: (
    <GlobalWrapper>
      <ProjectWrapper />
    </GlobalWrapper>
  ),
};
