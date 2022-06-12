import {
  Stack,
  Box,
  Heading,
  Editable,
  EditableInput,
  EditableTextarea,
  EditablePreview,
} from "@chakra-ui/react";
import "@chakra-ui/react";
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
          pt=".75rem"
          px="2rem"
          pb="1.5rem"
          borderRadius="3xl"
          // border="1px solid hsla(255, 22%, 100%, 0.3)"
          // boxShadow="xs"
        >
          <Editable
            fontFamily="Work Sans"
            defaultValue="Deck"
            fontWeight="bold"
            color="gray.100"
            fontSize="4xl"
            mb="-.5rem"
          >
            <EditablePreview />
            <EditableInput className="nodrag" w="450px" />
          </Editable>
          {props.children}
        </Stack>
      ) : (
        <Stack>{props.children}</Stack>
      )}
    </>
  );
}
