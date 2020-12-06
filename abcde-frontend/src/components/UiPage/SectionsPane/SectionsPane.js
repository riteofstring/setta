import React, { useEffect } from "react";
import { Flex } from "@chakra-ui/react";
import { useStoreState, useStoreActions } from "easy-peasy";
import PaneHeading from "../PaneHeading/PaneHeading";

import SectionContainer from "./SectionContainer/SectionContainer";

const SectionsPane = () => {
  const loadSections = useStoreActions((actions) => actions.master.loadSections);
  const sections = useStoreState((state) => state.master.sections);
  const visibleSectionIds = useStoreState((state) => state.master.visibleSectionIds);
  useEffect(() => {
    loadSections();
  }, [loadSections]);

  console.log("SectionsPane UPDATE");

  return (
    <Flex direction="column" mr="5rem" mt="2.5rem">
      <PaneHeading heading="Sections" />
      {visibleSectionIds.map((e, idx) => (
        <SectionContainer
          sectionId={e.id}
          visibleSectionIds={e.children}
          theSection={sections[e.id]}
          key={`${e.id}-${idx}`}
          depth={0}
        />
      ))}
    </Flex>
  );
};

export default React.memo(SectionsPane);
