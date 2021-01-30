import React from "react";
import { Route, Switch, Redirect } from "react-router-dom";
// import StartPage from "../../StartPage/StartPage";
import LoginPage from "../../LoginPage/LoginPage";
import LogoutPage from "../../LogoutPage/LogoutPage";
import InfoPage from "../../InfoPage/InfoPage";
import { useStoreState } from "easy-peasy";

const SwitchContainer = () => {
  return (
    <Switch>
      <Route exact path="/">
        <LoginPage />
      </Route>
      <PrivateRoute exact path="/info">
        <InfoPage />
      </PrivateRoute>
      <PrivateRoute exact path="/logout">
        <LogoutPage />
      </PrivateRoute>
    </Switch>
  );
};

const PrivateRoute = ({ children, ...rest }) => {
  const isAuthenticated = useStoreState((state) => state.auth.isAuthenticated);
  console.log("isAuthenticated", isAuthenticated);
  return (
    <Route
      {...rest}
      render={(props) =>
        isAuthenticated ? children : <Redirect to="/" />
      }
    />
  );
};

export default React.memo(SwitchContainer);
