import React, { useEffect } from "react";
import { Heading, VStack } from "@chakra-ui/react";
import { useStoreState, useStoreActions } from "easy-peasy";

import ObjectContainer from "./ObjectContainer/ObjectContainer";

const ObjectsPane = () => {
  const { loadObjects } = useStoreActions((actions) => actions.store);
  const { sections } = useStoreState((state) => state.store);
  useEffect(() => {
    loadObjects();
  }, [loadObjects]);

  return (
    <VStack spacing="2rem">
      <Heading as="h1" size="2xl">
        Objects
      </Heading>
      {sections.map((e, idx) => (
        <ObjectContainer theSection={e} key={`${e}-${idx}`} />
      ))}
    </VStack>
  );
};

export default React.memo(ObjectsPane);
