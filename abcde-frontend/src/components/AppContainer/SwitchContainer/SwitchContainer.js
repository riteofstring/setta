import React from "react";
import { Route, Switch, Redirect } from "react-router-dom";

import { NO_AUTH } from "../../../utils/constants";
import LoginPage from "../../LoginPage/LoginPage";
// import TerminalPage from "../../TerminalPage/TerminalPage";
import LogoutPage from "../../LogoutPage/LogoutPage";
import SignUpPage from "../../SignUpPage/SignUpPage";
import HeaderContainer from "../Header/Header";
import MainContainer from "../Main/MainContainer";

const SwitchContainer = ({ isAuthenticated }) => {
  const getRoute = () => {
    if (NO_AUTH) {
      return (
        <Route exact path="/">
          <HeaderContainer />
          <MainContainer />
        </Route>
      );
    } else if (isAuthenticated) {
      return (
        <Switch>
          <PrivateRoute exact path="/" isAuthenticated={isAuthenticated}>
            <HeaderContainer />
            <MainContainer />
          </PrivateRoute>
          {/* <PrivateRoute exact path="/terminal">
            <TerminalPage />
          </PrivateRoute> */}
          <PrivateRoute exact path="/logout" isAuthenticated={isAuthenticated}>
            <LogoutPage />
          </PrivateRoute>
        </Switch>
      );
    } else {
      return (
        <Switch>
          <Route exact path="/">
            <LoginPage />
          </Route>
          <Route exact path="/signup">
            <SignUpPage />
          </Route>
        </Switch>
      );
    }
  };
  return getRoute();
};

const PrivateRoute = ({ isAuthenticated, children, ...rest }) => {
  return (
    <Route
      {...rest}
      render={(props) => (isAuthenticated ? children : <Redirect to="/" />)}
    />
  );
};

export default React.memo(SwitchContainer);
