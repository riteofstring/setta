import SignUpPage from "components/SignUpPage/SignUpPage";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";
import { rootRoute } from "./root";

export const signUpRoute = rootRoute.createRoute({
  path: "signup",
  component: () => (
    <GridContainer>
      <SignUpPage />
    </GridContainer>
  ),
});
