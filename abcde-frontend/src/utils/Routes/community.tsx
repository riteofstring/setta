import { CommunityPage } from "components/Community/Community";
import { RouteObject } from "react-router-dom";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { GlobalWrapper } from "./GlobalWrapper";

function CommunityWrapper() {
  return (
    <GridContainer>
      <CommunityPage />
    </GridContainer>
  );
}

export const communityRoute: RouteObject = {
  path: "community",
  element: (
    <GlobalWrapper>
      <CommunityWrapper />
    </GlobalWrapper>
  ),
};
