import { Grid, theme } from "@chakra-ui/react";
import React from "react";

import { SortableSectionContainer } from "../SectionContainer/SortableSectionContainer";

const borderLeft = theme.colors.whiteAlpha;

function _NestedSection({ parentId, sectionId, nextId, depth, dummy, idxForList }) {
  return (
    // <VStack alignItems="stretch">
    <Grid gap={2}>
      <SortableSectionContainer
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        depth={depth}
        dummy={dummy}
        idxForList={idxForList}
      />
    </Grid>
    // </VStack>
  );
}

// function areEqual(prevProps, nextProps) {
//   return (
//     prevProps.sectionId === nextProps.sectionId &&
//     prevProps.idx === nextProps.idx
//   );
// }

// export default React.memo(NestedSection, areEqual);

export const NestedSection = React.memo(_NestedSection);
