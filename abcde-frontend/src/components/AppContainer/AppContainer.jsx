import { accessPage } from "dbRequests/authentication";
import { useStoreActions, useStoreState } from "easy-peasy";
import React, { useEffect } from "react";
import HeaderContainer from "./Header/Header";
import SwitchContainer from "./SwitchContainer/SwitchContainer";

const AppContainer = () => {
  const access_token = useStoreState((x) => x.auth.access_token);
  const actionStayLoggedIn = useStoreActions((x) => x.auth.stayLoggedIn);
  const actionLoginFail = useStoreActions((x) => x.auth.loginFail);

  useEffect(() => {
    accessPage({
      address: "",
      access_token,
      actionStayLoggedIn,
      actionLoginFail,
    });
  }, []);

  return (
    <>
      <HeaderContainer />
      <GridContainer>
        <SwitchContainer />
      </GridContainer>
    </>
  );
};

function GridContainer(props) {
  return (
    <main className="h-full w-screen border border-gray-200 overflow-hidden grid [grid-template-columns:1fr] [grid-template-rows:min-content 1fr]">
      {props.children}
    </main>
  );
}

export default React.memo(AppContainer);
