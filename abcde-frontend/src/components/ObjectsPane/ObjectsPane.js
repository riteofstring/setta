import React, { useEffect } from "react";
import { Heading, Flex } from "@chakra-ui/react";
import { useStoreState, useStoreActions } from "easy-peasy";

import ObjectContainer from "./ObjectContainer/ObjectContainer";

const ObjectsPane = () => {
  const loadObjects = useStoreActions((actions) => actions.store.loadObjects);
  const sections = useStoreState((state) => state.store.sections);

  console.log(sections);

  useEffect(() => {
    loadObjects();
  }, [loadObjects]);

  return (
    <Flex flexDir="column">
      <Heading as="h1" size="2xl" isTruncated>
        Objects
      </Heading>
      {sections.map((e, idx) => (
        <ObjectContainer theSection={e} key={`${e}-${idx}`} />
      ))}
    </Flex>
  );
};

export default ObjectsPane;
