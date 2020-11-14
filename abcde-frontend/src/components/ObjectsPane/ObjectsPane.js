import React, { useEffect } from "react";
import { Box, Flex } from "@chakra-ui/core";
import { useStoreState, useStoreActions } from "easy-peasy";

import ObjectSelect from "../ObjectSelect/ObjectSelect";

const ObjectsPane = () => {
  const loadObjects = useStoreActions((actions) => actions.store.loadObjects);
  const sections = useStoreState((state) => state.store.sections);

  console.log(sections);

  useEffect(() => {
    loadObjects();
  }, [loadObjects]);

  return (
    <Flex flexDir="column">
      <Box>Objects</Box>
      {sections.map((e, idx) => (
        <ObjectSelect theSection={e} key={`${e}-${idx}`} />
      ))}
    </Flex>
  );
};

export default ObjectsPane;
