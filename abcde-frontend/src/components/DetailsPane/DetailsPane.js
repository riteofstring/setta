import React from "react";
import { Box, Flex, VStack, HStack, Heading } from "@chakra-ui/react";
import { useStoreState, useStoreActions } from "easy-peasy";

const DetailsPane = () => {
  const { sections, activeObj } = useStoreState((state) => state.store);

  console.log("AHHH");
  console.log(sections.filter((e) => e.name === activeObj));

  return (
    <Flex flexDir="column">
      <VStack spacing="2rem">
        <Heading as="h1" size="2xl">
          Details
        </Heading>
        <HStack>
          <Box></Box>
        </HStack>
      </VStack>
    </Flex>
  );
};

export default DetailsPane;
