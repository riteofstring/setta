import { Grid } from "@chakra-ui/react";
import React from "react";

import { SortableSectionContainer } from "../SectionContainer/SortableSectionContainer";

function _NestedSection({ parentId, sectionId, nextId, depth }) {
  return (
    <Grid gap={2}>
      <SortableSectionContainer
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        depth={depth}
      />
    </Grid>
  );
}

export const NestedSection = React.memo(_NestedSection);
