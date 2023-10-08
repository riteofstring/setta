import { HeaderContainer } from "components/AppContainer/Header/Header";
import { HomePage } from "components/HomePage/HomePage";
import { useSettings } from "models/settings";
import { useEffect } from "react";
import { RouteObject } from "react-router-dom";
import { loadSettings } from "thunks/user/settings";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { GlobalWrapper } from "./GlobalWrapper";

function IndexWrapper() {
  const settingsLoaded = useSettings((x) => x.settingsLoaded);

  useEffect(() => {
    loadSettings();
  }, []);

  return (
    settingsLoaded && (
      <>
        <HeaderContainer />
        <GridContainer>
          <HomePage />
        </GridContainer>
      </>
    )
  );
}

export const indexRoute: RouteObject = {
  path: "/",
  element: (
    <GlobalWrapper>
      <IndexWrapper />
    </GlobalWrapper>
  ),
};
