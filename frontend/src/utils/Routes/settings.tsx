import { HeaderContainer } from "components/AppContainer/Header/Header";
import { Settings } from "components/Settings/Settings";
import { RouteObject } from "react-router-dom";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { GlobalWrapper } from "./GlobalWrapper";

const PATH = "settings";

function SettingsWrapper() {
  return (
    <>
      {/* <HeaderContainer path={PATH} /> */}
      {/* <GridContainer> */}
        <Settings />
      {/* </GridContainer> */}
    </>
  );
}
export const settingsRoute: RouteObject = {
  path: PATH,
  element: (
    <GlobalWrapper>
      <SettingsWrapper />
    </GlobalWrapper>
  ),
};
