import React, { useEffect } from "react";
import { Heading, VStack } from "@chakra-ui/react";
import { useStoreState, useStoreActions } from "easy-peasy";

import ObjectContainer from "./ObjectContainer/ObjectContainer";

const ObjectsPane = () => {
  const { loadObjects } = useStoreActions((actions) => actions.master);
  const { sections, sectionNames } = useStoreState((state) => state.master);
  useEffect(() => {
    loadObjects();
  }, [loadObjects]);

  return (
    <VStack spacing="2rem">
      <Heading as="h1" size="2xl">
        Objects
      </Heading>
      {sectionNames.map((e, idx) => (
        <ObjectContainer theSection={sections[e]} key={`${e}-${idx}`} />
      ))}
    </VStack>
  );
};

export default React.memo(ObjectsPane);
