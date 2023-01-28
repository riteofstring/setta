import SignUpPage from "components/SignUpPage/SignUpPage";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";

function SignUpWrapper() {
  return (
    <GridContainer>
      <SignUpPage />
    </GridContainer>
  );
}

export const signUpRoute = {
  path: "signup",
  element: <SignUpWrapper />,
};
