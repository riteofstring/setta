import { HeaderContainer } from "components/AppContainer/Header/Header";
import { HomePage } from "components/HomePage/HomePage";
import { LoginPage } from "components/LoginPage/LoginPage";
import { useAuth } from "models/auth";
import { RouteObject } from "react-router-dom";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { GlobalWrapper } from "./GlobalWrapper";

function IndexWrapper() {
  const isAuthenticated = useAuth((x) => x.isAuthenticated);

  return isAuthenticated ? (
    <>
      <HeaderContainer />
      <GridContainer>
        <HomePage />
      </GridContainer>
    </>
  ) : (
    <GridContainer>
      <LoginPage />
    </GridContainer>
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
