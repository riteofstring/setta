import React from "react";
import { useStoreState } from "easy-peasy";
import SectionContainer from "./SectionContainer";
import { Flex, Box } from "@chakra-ui/react";

import { getVisible } from "../../../../utils/sectionIds";

import { FiCornerDownRight } from "react-icons/fi";

const NestedSection = ({
  parentId,
  sectionId,
  visibleSectionIds,
  idx,
  depth,
}) => {
  const sections = useStoreState((state) => state.master.sections);
  const visible = useStoreState((state) => state.master.visible);

  return (
    <>
      <Flex
        mt="0rem"
        ml="2.5rem"
        display={!getVisible(visible, parentId) ? "none" : "inherit"}
        key={`nest-flex-${sectionId}-${idx}`}
      >
        <Box mt="0" mr=".5rem" key={`ic-con-${sectionId}-${idx}`}>
          <FiCornerDownRight
            size="2.4rem"
            color="#CBD5E0"
            key={`icon-${sectionId}-${idx}`}
          />
        </Box>
        <SectionContainer
          sectionId={sectionId}
          visibleSectionIds={visibleSectionIds}
          theSection={sections[sectionId]}
          depth={depth}
        />
      </Flex>
    </>
  );
};

export default React.memo(NestedSection);
