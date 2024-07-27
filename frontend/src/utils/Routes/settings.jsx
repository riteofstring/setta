import { HeaderContainer } from "components/AppHeader/Header";
import { Settings } from "components/Settings/Settings";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { SETTINGS_ROUTER_PATH } from "utils/constants";
import { GlobalWrapper } from "./GlobalWrapper";

function SettingsWrapper() {
  return (
    <>
      <HeaderContainer path={SETTINGS_ROUTER_PATH} />
      <GridContainer>
        <Settings />
      </GridContainer>
    </>
  );
}
export const settingsRoute = {
  path: SETTINGS_ROUTER_PATH,
  element: (
    <GlobalWrapper>
      <SettingsWrapper />
    </GlobalWrapper>
  ),
};
