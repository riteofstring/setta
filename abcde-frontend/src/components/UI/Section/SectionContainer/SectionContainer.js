import { Stack, Box, Heading } from "@chakra-ui/react";
import { useAddChild, useDeleteChild } from "hooks/useAddDeleteChild";
import { useIdsOverview } from "hooks/useIdsOverview";
import { useGetSectionType } from "hooks/useSectionType";
import React, { useState, useCallback } from "react";
import { DECK } from "utils/constants";

import ManyNestedSections from "../NestedSection/ManyNestedSections";
import SectionContainerCore from "./SectionContainerCore";

function SectionContainer({
  sectionId,
  parentId,
  nextId,
  depth,
  dragListeners,
}) {
  const isDeck = useGetSectionType(sectionId).type === DECK;
  const [idsOverview, setIdsOverview] = useIdsOverview(sectionId);
  const [childrenAreCollapsed, setChildrenAreCollapsed] = useState(false);
  const hasNested = idsOverview.length > 0;
  const addChild = useAddChild(sectionId);
  const deleteChild = useDeleteChild(sectionId);
  const flipChildrenAreCollapsed = useCallback(() => {
    setChildrenAreCollapsed(!childrenAreCollapsed);
  }, [childrenAreCollapsed]);
  console.log("isDeck: ", isDeck);

  return (
    <Container isDeck={isDeck}>
      {!isDeck && (
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
      )}
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
            isDeck={isDeck}
          />
        )}
      </Box>
    </Container>
  );
}
export default React.memo(SectionContainer, (prev, next) => {
  return prev.nextId === next.nextId;
});

function Container(props) {
  const isDeck = props.isDeck;
  return (
    <>
      {isDeck ? (
        <Stack
          bg="hsla(212, 22%, 50%, 0.2)"
          py="1.5rem"
          px="2rem"
          borderRadius="3xl"
          // border="1px solid hsla(255, 22%, 100%, 0.3)"
          // boxShadow="xs"
        >
          <Heading color="gray.100">Deck</Heading>
          {props.children}
        </Stack>
      ) : (
        <Stack>{props.children}</Stack>
      )}
    </>
  );
}
