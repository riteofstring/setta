import { HeaderContainer } from "components/AppContainer/Header/Header";
import { Settings } from "components/Settings/Settings";
import { RouteObject } from "react-router-dom";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { GlobalWrapper } from "./GlobalWrapper";

function SettingsWrapper() {
  return (
    <>
      <HeaderContainer />
      <GridContainer>
        <Settings />
      </GridContainer>
    </>
  );
}
export const settingsRoute: RouteObject = {
  path: "settings",
  element: (
    <GlobalWrapper>
      <SettingsWrapper />
    </GlobalWrapper>
  ),
};
