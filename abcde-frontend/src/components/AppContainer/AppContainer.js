import { Grid } from "@chakra-ui/react";
import { useStoreState, useStoreActions } from "easy-peasy";
import React, { useEffect } from "react";
import { BrowserRouter } from "react-router-dom";

import { verifyToken } from "../../dbRequests/authentication";
import HeaderContainer from "./Header/Header";
import SwitchContainer from "./SwitchContainer/SwitchContainer";

// import HeaderContainer from "./Header/Header";
// import MainContainer from "./Main/MainContainer";

const AppContainer = () => {
  //
  const token = useStoreState((state) => state.auth.token);
  const loginFail = useStoreActions((action) => action.auth.loginFail);
  const stayLoggedIn = useStoreActions((action) => action.auth.stayLoggedIn);

  // console.log("AppContainer isAuthenticated", isAuthenticated);

  useEffect(() => {
    verifyToken({
      authToken: token,
      actionStayLoggedIn: stayLoggedIn,
      actionLoginFail: loginFail,
    });
  }, []);

  return (
    <BrowserRouter>
      <HeaderContainer />
      <Grid
        h="100%"
        w="100vw"
        border="1px"
        overflow="hidden"
        templateRows="min-content 1fr"
        templateColumns="1fr"
        borderColor="gray.200"
      >
        <SwitchContainer />
      </Grid>
    </BrowserRouter>
  );
};

export default React.memo(AppContainer);
