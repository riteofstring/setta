import { HeaderContainer } from "components/AppHeader/Header";
import { Settings } from "components/SettingsPage/Settings";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { SETTINGS_ROUTER_PATH } from "utils/constants";
import { GlobalWrapper } from "./GlobalWrapper";

export const settingsRoute = {
  path: SETTINGS_ROUTER_PATH,
  element: (
    <GlobalWrapper>
      <HeaderContainer path={SETTINGS_ROUTER_PATH} />
      <GridContainer>
        <Settings />
      </GridContainer>
    </GlobalWrapper>
  ),
};
