import { Grid } from "@chakra-ui/react";
import React from "react";
import { BrowserRouter } from "react-router-dom";
import HeaderContainer from "./Header/Header";
import SwitchContainer from "./SwitchContainer/SwitchContainer";

const AppContainer = () => {
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
