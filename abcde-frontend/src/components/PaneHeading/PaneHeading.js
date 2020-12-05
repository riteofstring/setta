import React from "react";
import { Heading } from "@chakra-ui/react";

const PaneHeading = ({ heading }) => {
  return (
    <Heading
      as="h1"
      size="3xl"
      color="gray.600"
      fontWeight="100"
      letterSpacing="-0.0025rem"
      mb="2.5rem"
    >
      {heading}
    </Heading>
  );
};

export default React.memo(PaneHeading);
