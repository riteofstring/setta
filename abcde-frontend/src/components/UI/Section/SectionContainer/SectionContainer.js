import "@chakra-ui/react";
import { Box, Stack } from "@chakra-ui/react";
import { useAddChild, useDeleteChild } from "hooks/useAddDeleteChild";
import { useIdsOverview } from "hooks/useIdsOverview";
import { useGetSectionType } from "hooks/useSectionType";
import { useSetSectionPosition } from "hooks/useSetSectionPosition";
import React from "react";
import { useKeyPress } from "react-flow-renderer";
import { DECK } from "utils/constants";

import ManyNestedSections from "../NestedSection/ManyNestedSections";
import SectionTitle from "./Header/Title/SectionTitle";
import SectionContainerCore from "./SectionContainerCore";

function SectionContainer({
  sectionId,
  parentId,
  nextId,
  depth,
  dragListeners,
}) {
  const isDeck = useGetSectionType(sectionId).type === DECK;
  const idsOverview = useIdsOverview(sectionId)[0];
  const hasNested = idsOverview.length > 0;
  const addChild = useAddChild(sectionId);
  const deleteChild = useDeleteChild(sectionId);

  return (
    <Container
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      dragListeners={dragListeners}
    >
      {!isDeck && (
        <SectionContainerCore
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          addChild={addChild}
          deleteChild={deleteChild}
          hasNested={hasNested}
        />
      )}
      <Box flexDirection="column" display="flex">
        {hasNested && (
          <ManyNestedSections
            childIds={idsOverview}
            sectionId={sectionId}
            depth={depth}
            isDeck={isDeck}
          />
        )}
      </Box>
    </Container>
  );
}
export default React.memo(SectionContainer, (p, n) => {
  return p.nextId === n.nextId;
});

function Container(props) {
  const { isDeck, sectionId, parentId, dragListeners } = props;
  const refForPosition = useSetSectionPosition(sectionId);
  const ctrlPressed = useKeyPress(["Control", "Alt"]);
  const isDraggingChild = parentId && ctrlPressed;
  const trueDragListeners = isDraggingChild ? dragListeners : {};
  const className = isDraggingChild ? "nodrag" : "";
  const commonProps = { ref: refForPosition, ...trueDragListeners, className };

  return (
    <>
      {isDeck ? (
        <Stack
          bg="hsla(212, 22%, 50%, 0.2)"
          pt=".75rem"
          px="2rem"
          pb="1.5rem"
          borderRadius="3xl"
          {...commonProps}
          // border="1px solid hsla(255, 22%, 100%, 0.3)"
          // boxShadow="xs"
        >
          <DeckSectionTitle sectionId={sectionId} />
          {props.children}
        </Stack>
      ) : (
        <Stack {...commonProps}>{props.children}</Stack>
      )}
    </>
  );
}

function DeckSectionTitle({ sectionId }) {
  const editableProps = {
    fontFamily: "Work Sans",
    fontWeight: "bold",
    color: "gray.100",
    fontSize: "4xl",
    mb: "-.5rem",
    letterSpacing: "tighter",
  };

  const inputProps = {
    className: "nodrag",
    w: "450px",
    letterSpacing: "tighter",
  };
  return (
    <SectionTitle
      sectionId={sectionId}
      editableProps={editableProps}
      inputProps={inputProps}
    />
  );
}
