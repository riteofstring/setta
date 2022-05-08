import { Grid, Stack, theme } from "@chakra-ui/react";
import React from "react";

import { SortableSectionContainer } from "../SectionContainer/SortableSectionContainer";

const borderLeft = theme.colors.gray;

function _NestedSection({ parentId, sectionId, nextId, depth, dummy }) {
  return (
    <Stack
      direction="column"
      pl="1rem"
      ml=".5rem"
      boxShadow={`inset 0.25rem 0px 0px 0px ${borderLeft[50]}`}
    >
      <Grid gap={2}>
        <SortableSectionContainer
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          depth={depth}
          dummy={dummy}
        />
      </Grid>
    </Stack>
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
