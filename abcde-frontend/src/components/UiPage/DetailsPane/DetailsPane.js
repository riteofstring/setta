import React from "react";
import { VStack, Flex } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import DetailsContainer from "./DetailsContainer/DetailsContainer";
import PaneHeading from "../PaneHeading/PaneHeading";

const DetailsPane = () => {
  const sectionId = useStoreState(
    (state) => state.globalCurr.sectionId,
    (prev, next) => prev && next
  );

  return (
    <VStack
      position="fixed"
      zIndex="5"
      right="2.5rem"
      top="7.5rem"
      visibility={sectionId ? "visible" : "hidden"}
    >
      <Flex
        align="flex-start"
        flexDir="column"
        boxShadow="xl"
        bg="gray.50"
        borderRadius="3xl"
        padding="5rem"
        minHeight="50vh"
        width="50vw"
      >
        <PaneHeading heading="Details" />

        <DetailsContainer />
      </Flex>
    </VStack>
  );
};

export default DetailsPane;
