import "@chakra-ui/react";
import { Box, Stack } from "@chakra-ui/react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useAddChild, useDeleteChild } from "hooks/useAddDeleteChild";
import { useDragActivation } from "hooks/useDragActivation";
import { useIdsOverview } from "hooks/useIdsOverview";
import { useGetSectionType } from "hooks/useSectionType";
import { useSetSectionPosition } from "hooks/useSetSectionPosition";
import React from "react";
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
      hasNested={hasNested}
      dragListeners={dragListeners}
      depth={depth}
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

      {hasNested && (
        <Box flexDirection="column" display="flex">
          <ManyNestedSections
            childIds={idsOverview}
            sectionId={sectionId}
            depth={depth}
            isDeck={isDeck}
          />
        </Box>
      )}
    </Container>
  );
}
export default React.memo(SectionContainer, (p, n) => {
  return p.nextId === n.nextId;
});

function Container(props) {
  const { isDeck, sectionId, parentId, dragListeners, hasNested, depth } =
    props;
  const { setNodeRef: droppableRef } = useDroppable({ id: sectionId });
  const { listeners: topLevelDragListeners, setNodeRef: draggableRef } =
    useDraggable({
      id: sectionId,
      data: { depth },
    });
  const refForPosition = useSetSectionPosition(sectionId);
  const { isSorting, isMovingFree } = useDragActivation();
  const isDraggingSortable = parentId && (isSorting || isMovingFree);
  const isDraggingTopLevel = depth === 0 && isMovingFree;
  let trueDragListeners = {};
  if (isDraggingSortable) {
    trueDragListeners = dragListeners;
  } else if (isDraggingTopLevel) {
    trueDragListeners = topLevelDragListeners;
  }

  // Don't want the react-flow node (which contains this child)
  // to move when sorting
  const className = isDraggingSortable ? "nodrag" : "";

  function totalRef(e) {
    refForPosition.current = e;
    if (isDeck && !hasNested && !isSorting) {
      droppableRef(e);
    }
    if (depth === 0) {
      draggableRef(e);
    }
  }

  const commonProps = { ref: totalRef, ...trueDragListeners, className };

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
          className="STACK"
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
