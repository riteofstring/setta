import React, { useEffect } from "react";
import { Heading, VStack, Flex } from "@chakra-ui/react";
import { useStoreState, useStoreActions } from "easy-peasy";
import { getSection, getVisibleSectionOrder } from "../../utils/sectionIds"

import ObjectContainer from "./ObjectContainer/ObjectContainer";

const ObjectsPane = () => {
  const { loadObjects } = useStoreActions((actions) => actions.master);
  const { sections, visibleSectionIds } = useStoreState((state) => state.master);
  useEffect(() => {
    loadObjects();
  }, [loadObjects]);

  return (
    <Flex direction="column" spacing="2rem">
      <Heading as="h1" size="2xl">
        Objects
      </Heading>
      {getVisibleSectionOrder(visibleSectionIds).map((e, idx) => (
        <ObjectContainer sectionId={e} theSection={getSection(sections, e)} key={`${e}-${idx}`} />
       
      ))}
    </Flex>
  );
};

export default React.memo(ObjectsPane);
