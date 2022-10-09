import { Grid } from "@chakra-ui/react";
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
      <Grid
        h="calc(100vh - 3.5rem)"
        w="100vw"
        border="1px"
        overflow="hidden"
        templateRows="min-content 1fr"
        templateColumns="1fr"
        borderColor="gray.200"
      >
        <SwitchContainer />
      </Grid>
    </>
  );
};

export default React.memo(AppContainer);
