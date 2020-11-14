import React from "react";
import ObjectsPane from "../ObjectsPane/ObjectsPane";
import DetailsPane from "../DetailsPane/DetailsPane";

import { Flex, Grid } from "@chakra-ui/core";

const Container = () => {
  return (
    <Flex align="center" justify="center" h="100vh">
      <Grid
        w="80vw"
        maxWidth={1280}
        h="100%"
        gap={10}
        templateColumns="repeat(2, 1fr)"
      >
        <ObjectsPane />
        <DetailsPane />
      </Grid>
    </Flex>
  );
};

export default Container;
