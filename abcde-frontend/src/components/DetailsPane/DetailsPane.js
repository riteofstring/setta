import React from "react";
import { Box, Flex, VStack, HStack, Heading } from "@chakra-ui/react";
import { useStoreState, useStoreActions } from "easy-peasy";
import DetailsContainer from "./DetailsContainer/DetailsContainer";

const DetailsPane = () => {
  const { activeObj } = useStoreState((state) => state.store);

  return (
    <Flex flexDir="column">
      <VStack spacing="2rem">
        <Heading as="h1" size="2xl">
          Details
        </Heading>
        <HStack>
          {!!activeObj && <DetailsContainer />}
          <Box></Box>
        </HStack>
      </VStack>
    </Flex>
  );
};

export default DetailsPane;
