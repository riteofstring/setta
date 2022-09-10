import { useStoreState } from "easy-peasy";
import React from "react";
// import HomePage from "../../HomePage";
import LoginPage from "../../LoginPage/LoginPage";
// import LogoutPage from "../../LogoutPage/LogoutPage";
// import SignUpPage from "../../SignUpPage/SignUpPage";
import MainContainer from "../Main/MainContainer";

const SwitchContainer = () => {
  const isAuthenticated = useStoreState((state) => state.auth.isAuthenticated);
  return isAuthenticated ? <MainContainer /> : <LoginPage />;
};

export default React.memo(SwitchContainer);
