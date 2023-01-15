import HeaderContainer from "components/AppContainer/Header/Header";
import MainContainer from "components/AppContainer/Main/MainContainer";
import { ReactFlowProvider } from "react-flow-renderer";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";

export const projectRoute = {
  path: ":username/:projectName/:configName",
  element: (
    <ReactFlowProvider>
      <HeaderContainer />
      <GridContainer>
        <MainContainer />
      </GridContainer>
    </ReactFlowProvider>
  ),
};
