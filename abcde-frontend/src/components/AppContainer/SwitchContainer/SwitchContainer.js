import React from "react";
import { Route, Switch } from "react-router-dom";
// import StartPage from "../../StartPage/StartPage";
import DevPage from "../../DevPage/DevPage";
import UiPage from "../../UiPage/UiPage";

const SwitchContainer = () => {
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
    </Switch>
  );
};

export default React.memo(SwitchContainer);
