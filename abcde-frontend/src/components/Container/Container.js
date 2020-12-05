import React from "react";
import ObjectsPane from "../ObjectsPane/ObjectsPane";
import DetailsPane from "../DetailsPane/DetailsPane";

import { Flex } from "@chakra-ui/react";

const Container = () => {
  return (
    <Flex align="center" justify="center" h="100vh">
      <Flex w="80vw" maxWidth={1280} h="100%" p="5rem">
        <ObjectsPane />
        <DetailsPane />
      </Flex>
    </Flex>
  );
};

export default React.memo(Container);
