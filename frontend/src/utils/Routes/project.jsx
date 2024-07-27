import { HeaderContainer } from "components/AppHeader/Header";
import { ModalContainer } from "components/Modals/ModalContainer";
import { MainContainer } from "components/ProjectPage/MainContainer";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { PROJECT_ROUTER_PATH } from "utils/constants";
import { GlobalWrapper } from "./GlobalWrapper";

export const projectRoute = {
  path: PROJECT_ROUTER_PATH,
  element: (
    <GlobalWrapper>
      <ModalContainer>
        <HeaderContainer path={PROJECT_ROUTER_PATH} />
        <GridContainer>
          <MainContainer />
        </GridContainer>
      </ModalContainer>
    </GlobalWrapper>
  ),
};
