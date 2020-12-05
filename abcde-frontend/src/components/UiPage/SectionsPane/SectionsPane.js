import React, { useEffect } from "react";
import { Flex } from "@chakra-ui/react";
import { useStoreState, useStoreActions } from "easy-peasy";
import { getSection } from "../../../utils/sectionIds";
import PaneHeading from "../PaneHeading/PaneHeading";

import SectionContainer from "./SectionContainer/SectionContainer";

const SectionsPane = () => {
  const { loadSections } = useStoreActions((actions) => actions.master);
  const { sections, visibleSectionIds } = useStoreState(
    (state) => state.master
  );
  useEffect(() => {
    loadSections();
  }, [loadSections]);

  return (
    <Flex direction="column" mr="5rem" mt="2.5rem">
      <PaneHeading heading="Sections" />
      {Object.keys(visibleSectionIds).map((e, idx) => (
        <SectionContainer
          sectionId={e}
          visibleSectionIds={visibleSectionIds[e]}
          theSection={getSection(sections, e)}
          key={`${e}-${idx}`}
          depth={0}
        />
      ))}
    </Flex>
  );
};

export default React.memo(SectionsPane);
