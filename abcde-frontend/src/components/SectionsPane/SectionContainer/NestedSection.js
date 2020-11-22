import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import SectionContainer from "./SectionContainer"
import { Flex, Box } from "@chakra-ui/react";

import { getSection, combineIds, getVisible } from "../../../utils/sectionIds";

import { FiCornerDownRight } from "react-icons/fi";

const NestedSection = ({ sectionId, visibleSectionIds, e, idx }) => {
  const { sections, visible } = useStoreState((state) => state.master);

  return (
    <>
      <Flex
        mt="0rem"
        ml="2.5rem"
        display={!getVisible(visible, sectionId) ? "none" : "inherit"}
        key={`nest-flex-${e}-${idx}`}
      >
        <Box mt="0" mr=".5rem" key={`ic-con-${e}-${idx}`}>
          <FiCornerDownRight
            size="2.4rem"
            color="#CBD5E0"
            key={`icon-${e}-${idx}`}
          />
        </Box>
        <SectionContainer
          sectionId={combineIds(sectionId, e)}
          visibleSectionIds={visibleSectionIds[e]}
          theSection={getSection(sections, combineIds(sectionId, e))}
        />
      </Flex>
    </>
  );
};

export default React.memo(NestedSection);
