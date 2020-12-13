import React from "react";
import { useStoreState } from "easy-peasy";
import SectionContainer from "./SectionContainer";
import { Flex, Box } from "@chakra-ui/react";
import { FiCornerDownRight } from "react-icons/fi";

import { useMeasurePosition } from "../../../../utils/framerDragPos/useMeasurePosition";

const NestedSection = ({
  parentId,
  rootId,
  sectionId,
  idx,
  depth,
  childrenIds,
  updatePosition,
}) => {
  const ref = useMeasurePosition((pos) => updatePosition(idx, pos));

  const theSection = useStoreState((state) => state.master.sections[sectionId]);
  const isShown = useStoreState((state) => state.master.isShown[parentId]);
  const isVisible = useStoreState((state) => state.master.isVisible[sectionId]);
  const idHierarchy = useStoreState(
    (state) => state.master.idHierarchy[sectionId]
  );

  console.log("NestedSection", sectionId, rootId, ref);
  console.log("NestedSection childrenIds", childrenIds);

  return isVisible ? (
    <>
      <Flex
        mt="0rem"
        ml="2.5rem"
        display={!isShown ? "none" : "inherit"}
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
          rootId={rootId}
          parentId={parentId}
          childrenIds={idHierarchy.children}
          theSection={theSection}
          depth={depth}
          idx={idx}
          // ref={ref}
          // updateOrder={updateOrder}
        />
      </Flex>
    </>
  ) : (
    <></>
  );
};

export default React.memo(NestedSection);
