import React from "react";
import { Heading } from "@chakra-ui/react";

const SectionHeading = ({ heading }) => {
  console.log("SectionHeading");

  return (
    <Heading as="h2" size="lg" mb="0.5rem" w="100%" color="gray.500">
      {heading}
    </Heading>
  );
};

export default React.memo(SectionHeading);
