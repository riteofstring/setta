import React, { useEffect } from "react";
import { Box, Flex } from "@chakra-ui/core";
import { useStoreState, useStoreActions } from "easy-peasy";

const DetailsPane = () => {
  const loadObjects = useStoreActions((actions) => actions.store.loadObjects);

  return (
    <Flex flexDir="column">
      <Box>Details</Box>
    </Flex>
  );
};

export default DetailsPane;
