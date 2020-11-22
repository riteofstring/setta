import React, { useEffect } from "react";
import { Heading, VStack, Flex } from "@chakra-ui/react";
import { useStoreState, useStoreActions } from "easy-peasy";

import ObjectContainer from "./ObjectContainer/ObjectContainer";

const ObjectsPane = () => {
  const { loadObjects } = useStoreActions((actions) => actions.master);
  const { sections, sectionNames, orderAndDepth } = useStoreState((state) => state.master);
  useEffect(() => {
    loadObjects();
  }, [loadObjects]);

  return (
    <Flex direction="column" spacing="2rem">
      <Heading as="h1" size="2xl">
        Objects
      </Heading>
      {orderAndDepth.map((e, idx) => (
        <ObjectContainer depth={e.depth} theSection={sections[e.name]} key={`${e.name}-${idx}`} />
       
      ))}
    </Flex>
  );
};

export default React.memo(ObjectsPane);
