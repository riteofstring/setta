import React, { useEffect } from "react";
import { Flex } from "@chakra-ui/react";
import { useStoreState, useStoreActions } from "easy-peasy";
import PaneHeading from "../PaneHeading/PaneHeading";

import SectionContainer from "./SectionContainer/SectionContainer";

const SectionsPane = () => {
  const loadSections = useStoreActions(
    (actions) => actions.master.loadSections
  );
  const sections = useStoreState((state) => state.master.sections);
  const rootIdHierarchy = useStoreState(
    (state) => state.master.rootIdHierarchy
  );
  useEffect(() => {
    loadSections();
  }, [loadSections]);

  console.log("SectionsPane");

  return (
    <Flex direction="column" mr="5rem" mt="2.5rem">
      <PaneHeading heading="Sections" />
      {Object.keys(rootIdHierarchy).map((e, idx) => (
        <SectionContainer
          sectionId={e}
          rootId={e}
          childrenIds={rootIdHierarchy[e].children}
          theSection={sections[e]}
          key={`${e}-${idx}`}
          depth={0}
        />
      ))}
    </Flex>
  );
};

export default React.memo(SectionsPane);
