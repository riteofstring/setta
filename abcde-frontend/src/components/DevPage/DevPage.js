import React from "react";
import { Flex, HStack, Box, StackDivider } from "@chakra-ui/react";
import DevPane from "./DevPane/DevPane";

const AppContainer = () => {
  return (
    <Flex w="95vw" maxWidth={1600} minHeight="100vh" p="5rem" mt="5rem">
      <DevPane />
    </Flex>
  );
};

export default React.memo(AppContainer);
