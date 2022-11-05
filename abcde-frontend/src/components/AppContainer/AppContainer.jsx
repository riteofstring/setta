import { Grid } from "@chakra-ui/react";
import { useAccessPage } from "hooks/dbRequests/authentication";
import React, { useEffect } from "react";
import HeaderContainer from "./Header/Header";
import SwitchContainer from "./SwitchContainer/SwitchContainer";

const AppContainer = () => {
  const accessPage = useAccessPage();

  useEffect(() => {
    accessPage({ address: "" });
  }, []);

  return (
    <>
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
    </>
  );
};

export default React.memo(AppContainer);
