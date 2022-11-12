import { Grid } from "@chakra-ui/react";
import { useAccessPage } from "hooks/dbRequests/authentication";
import React, { useEffect } from "react";
import { ReactFlowProvider } from "react-flow-renderer";
import HeaderContainer from "./Header/Header";

const AppContainer = () => {
  const accessPage = useAccessPage();

  useEffect(() => {
    accessPage({ address: "" });
  }, []);

  return (
    <ReactFlowProvider>
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
        {/* <SwitchContainer /> */}
      </Grid>
    </ReactFlowProvider>
  );
};

export default React.memo(AppContainer);
