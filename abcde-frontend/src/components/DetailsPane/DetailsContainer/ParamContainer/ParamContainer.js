import React from "react";
import { VStack, Heading } from "@chakra-ui/react";
import TheParam from "./TheParam/TheParam";

const ParamContainer = ({ parameters }) => {
  const { name } = parameters;

  return (
    <VStack>
      <Heading as="h3" size="md">
        {name}
      </Heading>
      <TheParam parameters={parameters} />
    </VStack>
  );
};

export default ParamContainer;
