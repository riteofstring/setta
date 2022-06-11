import { Stack, Box } from "@chakra-ui/react";
import { useAddChild, useDeleteChild } from "hooks/useAddDeleteChild";
import { useIdsOverview } from "hooks/useIdsOverview";
import React, { useState, useCallback } from "react";

import ManyNestedSections from "../NestedSection/ManyNestedSections";
import SectionContainerCore from "./SectionContainerCore";

function SectionContainer({
  sectionId,
  parentId,
  nextId,
  depth,
  dragListeners,
}) {
  const [idsOverview, setIdsOverview] = useIdsOverview(sectionId);
  const [childrenAreCollapsed, setChildrenAreCollapsed] = useState(false);
  const hasNested = idsOverview.length > 0;

  const addChild = useAddChild(sectionId);
  const deleteChild = useDeleteChild(sectionId);

  const flipChildrenAreCollapsed = useCallback(() => {
    setChildrenAreCollapsed(!childrenAreCollapsed);
  }, [childrenAreCollapsed]);

  return (
    <Stack>
      <SectionContainerCore
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        addChild={addChild}
        deleteChild={deleteChild}
        hasNested={hasNested}
        childrenAreCollapsed={childrenAreCollapsed}
        flipChildrenAreCollapsed={flipChildrenAreCollapsed}
        dragListeners={dragListeners}
      />

      <Box
        flexDirection="column"
        display={childrenAreCollapsed ? "none" : "flex"}
      >
        {hasNested && (
          <ManyNestedSections
            childIds={idsOverview}
            sectionId={sectionId}
            depth={depth}
            setChildren={setIdsOverview}
          />
        )}
      </Box>
    </Stack>
  );
}

export default React.memo(SectionContainer, (prev, next) => {
  return prev.nextId === next.nextId;
});
