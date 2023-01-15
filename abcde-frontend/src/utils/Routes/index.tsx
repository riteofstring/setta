import HeaderContainer from "components/AppContainer/Header/Header";
import HomePage from "components/HomePage/HomePage";
import LoginPage from "components/LoginPage/LoginPage";
import { useAuth } from "models/auth";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { rootRoute } from "./root";

function IndexComponent() {
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

export const indexRoute = rootRoute.createRoute({
  path: "/",
  component: IndexComponent,
});
