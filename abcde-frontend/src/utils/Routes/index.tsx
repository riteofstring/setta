import LoginPage from "components/LoginPage/LoginPage";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { rootRoute } from "./root";

export const indexRoute = rootRoute.createRoute({
  path: "/",
  component: () => (
    <GridContainer>
      <LoginPage />
    </GridContainer>
  ),
});
