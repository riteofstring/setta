import React, { useState, useLayoutEffect } from "react";
import { Box, Flex, VStack, HStack, Heading } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import DetailsContainer from "./DetailsContainer/DetailsContainer";

const DetailsPane = () => {
  const { activeObj } = useStoreState((state) => state.master);

  const [loaded, isLoaded] = useState(false);

  const setLoaded = () => {
    isLoaded(true);
  };
  useLayoutEffect(() => {
    if (activeObj) {
      setLoaded();
    }
  });

  return (
    <Flex flexDir="column">
      <VStack spacing="2rem">
        <Heading as="h1" size="2xl">
          Details
        </Heading>
        <HStack>
          {loaded && <DetailsContainer />}
          <Box></Box>
        </HStack>
      </VStack>
    </Flex>
  );
};

export default DetailsPane;
