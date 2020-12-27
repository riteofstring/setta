import React from "react";
import { useStoreState } from "easy-peasy";
import { Heading, Stack } from "@chakra-ui/react";

const SectionHeading = ({ theSection, sectionId, isListRoot = false }) => {
  const sectionHeading = theSection.name;

  const selected = useStoreState((state) => state.master.selected[sectionId]);

  const currObjectName = selected.name;

  return (
    <Stack direction="column">
      <Heading as="h2" size="lg" w="100%" color="gray.400" fontWeight="500">
        {isListRoot ? `List for: ${sectionHeading}` : sectionHeading}
      </Heading>
      <Heading as="h3" size="sm" mb="0.5rem" color="gray.500">
        {Object.keys(theSection.moduleInfos).length > 0
          ? currObjectName
            ? currObjectName
            : theSection.name
          : "Not Selected"}
      </Heading>
    </Stack>
  );
};

export default React.memo(SectionHeading);
