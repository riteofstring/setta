import React from "react";
import Run from "./Run/Run";

import { Flex } from "@chakra-ui/react";

const Submit = () => {
  return (
    <Flex
      w="100vw"
      height="5rem"
      position="fixed"
      bottom="0"
      bg="gray.500"
      justifyContent="center"
      alignItems="center"
      zIndex="5"
    >
      <Run />
    </Flex>
  );
};

export default React.memo(Submit);
