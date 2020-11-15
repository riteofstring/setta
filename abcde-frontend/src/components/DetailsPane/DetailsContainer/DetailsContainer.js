import React from "react";
import { Box, Flex, VStack, HStack, Heading } from "@chakra-ui/react";
import { useStoreState, useStoreActions } from "easy-peasy";

const DetailsContainer = () => {
  const { selected, activeObj } = useStoreState((state) => state.store);

  return (
    <HStack>
      <Box></Box>
    </HStack>
  );
};

export default DetailsContainer;
