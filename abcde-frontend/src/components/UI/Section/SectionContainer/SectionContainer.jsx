import "@chakra-ui/react";
import { Box, Grid, Stack } from "@chakra-ui/react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useDndSortableProps } from "hooks/useDndSortableProps";
import { useHighlightDroppable } from "hooks/useDndUtils";
import { useDragActivation } from "hooks/useDragActivation";
import { useIdsOverview } from "hooks/useIdsOverview";
import { useGetSectionType } from "hooks/useSectionType";
import { useSetSectionPosition } from "hooks/useSetSectionPosition";
import React from "react";
import { DECK } from "utils/constants";
import ManyNestedSections from "../NestedSection/ManyNestedSections";
import SectionTitle from "./Header/Title/SectionTitle";
import SectionContainerCore from "./SectionContainerCore";

function SectionContainer({ sectionId, parentId, nextId, depth }) {
  const isDeck = useGetSectionType(sectionId).type === DECK;
  const idsOverview = useIdsOverview(sectionId);
  const hasNested = idsOverview.length > 0;

  return (
    <Wrapper
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      nextId={nextId}
      hasNested={hasNested}
      depth={depth}
    >
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
    </Wrapper>
  );
}
export default React.memo(SectionContainer, (p, n) => {
  return p.nextId === n.nextId;
});

function TopLevelSectionWrapper({
  isDeck,
  sectionId,
  parentId,
  nextId,
  hasNested,
  children,
}) {
  const { setNodeRef: droppableRef } = useDroppable({ id: sectionId });
  const { listeners: topLevelDragListeners, setNodeRef: draggableRef } =
    useDraggable({
      id: sectionId,
      data: { depth: 0 },
    });
  const refForPosition = useSetSectionPosition(sectionId);
  const { isMovingFree } = useDragActivation();
  const trueDragListeners = isMovingFree ? topLevelDragListeners : {};

  function totalRef(e) {
    refForPosition.current = e;
    droppableRef(e);
    draggableRef(e);
  }
  const dragDropProps = { ref: totalRef, ...trueDragListeners };
  const { sectionStyle, contextStyle } = useHighlightDroppable({
    sectionId,
    sectionIsSameAsContext: isDeck,
  });

  return (
    <DeckOrNot
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      nextId={nextId}
      hasNested={hasNested}
      sectionStyle={sectionStyle}
      contextStyle={contextStyle}
      dragDropProps={dragDropProps}
    >
      {children}
    </DeckOrNot>
  );
}

function NestedSectionWrapper({
  isDeck,
  sectionId,
  parentId,
  nextId,
  hasNested,
  children,
}) {
  const {
    dragListeners,
    ref: sortableRef,
    style: sortableStyle,
  } = useDndSortableProps(sectionId);
  const refForPosition = useSetSectionPosition(sectionId);
  const { isSorting, isMovingFree } = useDragActivation();
  const inDraggingMode = isSorting || isMovingFree;
  const trueDragListeners = inDraggingMode ? dragListeners : {};

  function totalRef(e) {
    refForPosition.current = e;
    sortableRef(e);
  }

  // Don't want the react-flow node (which contains this child)
  // to move when sorting
  const className = inDraggingMode ? "nodrag" : "";
  const dragDropProps = { ref: totalRef, ...trueDragListeners, className };
  const { sectionStyle, contextStyle } = useHighlightDroppable({
    sectionId,
    sectionIsSameAsContext: isDeck,
  });
  const style = {
    ...sectionStyle,
    ...sortableStyle,
  };

  return (
    <DeckOrNot
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      nextId={nextId}
      hasNested={hasNested}
      sectionStyle={style}
      contextStyle={contextStyle}
      dragDropProps={dragDropProps}
    >
      {children}
    </DeckOrNot>
  );
}

function DeckOrNot({
  isDeck,
  sectionId,
  parentId,
  nextId,
  hasNested,
  sectionStyle,
  contextStyle,
  dragDropProps,
  children,
}) {
  if (isDeck) {
    return (
      <Box {...sectionStyle} {...dragDropProps}>
        <Stack
          bg="hsla(212, 22%, 50%, 0.2)"
          pt=".75rem"
          px="2rem"
          pb="1.5rem"
          borderRadius="3xl"
          className="STACK"
        >
          <DeckSectionTitle sectionId={sectionId} />
          {children}
        </Stack>
      </Box>
    );
  }
  return (
    <Grid gap={2}>
      <Stack {...contextStyle}>
        <Box {...dragDropProps}>
          <SectionContainerCore
            sectionId={sectionId}
            parentId={parentId}
            nextId={nextId}
            hasNested={hasNested}
          />
          <div style={sectionStyle} />
        </Box>
        {children}
      </Stack>
    </Grid>
  );
}

function Wrapper({
  isDeck,
  sectionId,
  parentId,
  nextId,
  hasNested,
  depth,
  children,
}) {
  if (depth === 0) {
    return (
      <TopLevelSectionWrapper
        isDeck={isDeck}
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        hasNested={hasNested}
      >
        {children}
      </TopLevelSectionWrapper>
    );
  }
  return (
    <NestedSectionWrapper
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      nextId={nextId}
      hasNested={hasNested}
    >
      {children}
    </NestedSectionWrapper>
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
