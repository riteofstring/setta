import { Grid } from "@chakra-ui/react";
import React from "react";
import SectionContainer from "../SectionContainer/SectionContainer";

function _NestedSection({ parentId, sectionId, nextId, depth }) {
  return (
    <Grid gap={2}>
      <SectionContainer
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        depth={depth}
      />
    </Grid>
  );
}

export const NestedSection = React.memo(_NestedSection);
