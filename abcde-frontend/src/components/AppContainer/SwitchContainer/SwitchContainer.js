import React from "react";
import { Route, Switch, Redirect } from "react-router-dom";
import LoginPage from "../../LoginPage/LoginPage";
import SignUpPage from "../../SignUpPage/SignUpPage";
import DevPage from "../../DevPage/DevPage";
import TerminalPage from "../../TerminalPage/TerminalPage";
import LogoutPage from "../../LogoutPage/LogoutPage";
import { useStoreState } from "easy-peasy";
import HeaderContainer from "../Header/Header";
import MainContainer from "../Main/MainContainer";

const SwitchContainer = () => {
  return (
    <Switch>
      <Route exact path="/">
        <LoginPage />
      </Route>
      <Route exact path="/signup">
        <SignUpPage />
      </Route>
      <PrivateRoute exact path="/ui">
        <HeaderContainer />
        <MainContainer />
      </PrivateRoute>
      {/* <PrivateRoute exact path="/developer">
        <DevPage />
      </PrivateRoute> */}
      {/* <PrivateRoute exact path="/terminal">
        <TerminalPage />
      </PrivateRoute> */}
      {/* <PrivateRoute exact path="/logout">
        <LogoutPage />
      </PrivateRoute> */}
    </Switch>
  );
};

const PrivateRoute = ({ children, ...rest }) => {
  const isAuthenticated = useStoreState((state) => state.auth.isAuthenticated);
  console.log("isAuthenticated", isAuthenticated);
  return (
    <Route
      {...rest}
      render={(props) => (isAuthenticated ? children : <Redirect to="/" />)}
    />
  );
};

export default React.memo(SwitchContainer);
