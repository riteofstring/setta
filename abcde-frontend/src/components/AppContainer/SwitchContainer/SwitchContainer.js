import { useStoreState } from "easy-peasy";
import React from "react";
import { Redirect, Route, Switch } from "react-router-dom";
import HomePage from "../../HomePage";
import LoginPage from "../../LoginPage/LoginPage";
import LogoutPage from "../../LogoutPage/LogoutPage";
import SignUpPage from "../../SignUpPage/SignUpPage";
import MainContainer from "../Main/MainContainer";

const SwitchContainer = () => {
  const isAuthenticated = useStoreState((state) => state.auth.isAuthenticated);
  const getRoute = () => {
    if (isAuthenticated) {
      return (
        <Switch>
          <PrivateRoute exact path="/" isAuthenticated={isAuthenticated}>
            <MainContainer />
          </PrivateRoute>
          <PrivateRoute exact path="/logout" isAuthenticated={isAuthenticated}>
            <LogoutPage />
          </PrivateRoute>
          <PrivateRoute exact path="/home" isAuthenticated={isAuthenticated}>
            <HomePage />
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
      render={() => (isAuthenticated ? children : <Redirect to="/" />)}
    />
  );
};

export default React.memo(SwitchContainer);
