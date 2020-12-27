import React from "react";
import { Route, Switch } from "react-router-dom";
// import StartPage from "../../StartPage/StartPage";
import LoginPage from "../../LoginPage/LoginPage";
import SignUpPage from "../../SignUpPage/SignUpPage";
import DevPage from "../../DevPage/DevPage";
import UiPage from "../../UiPage/UiPage";

const SwitchContainer = () => {
  const items = ["te", "st", "on", "e"];

  return (
    <Switch>
      <Route exact path="/">
        <UiPage />
      </Route>
      {/* <Route path="/start">
        <StartPage />
      </Route> */}
      <Route path="/developer">
        <DevPage />
      </Route>
      <Route path="/login">
        <LoginPage />
      </Route>
      <Route path="/signup">
        <SignUpPage />
      </Route>
    </Switch>
  );
};

export default React.memo(SwitchContainer);
