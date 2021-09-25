import React from "react";
import { Grid, Stack, theme } from "@chakra-ui/react";
import SectionContainer from "../SectionContainer/SectionContainer";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const borderLeft = theme.colors.gray;

function NestedSection({
  parentId,
  sectionId,
  nextId,
  sectionInfo,
  available,
  parentControls,
  idx,
  depth,
  isCollapsed,
  setIdsOverview,
  setIdNames,
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: sectionId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getNestedSection = () => {
    return (
      <SectionContainer
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        sectionInfo={sectionInfo}
        available={available}
        depth={depth}
        parentControls={parentControls}
        isCollapsed={isCollapsed}
        setIdsOverview={setIdsOverview}
        setIdNames={setIdNames}
      />
    );
  };

  const StackWrapper = (inner) => {
    return (
      <Stack
        direction="column"
        pl="1rem"
        ml=".5rem"
        boxShadow={`inset 0.25rem 0px 0px 0px ${borderLeft[50]}`}
        style={style}
        ref={setNodeRef}
        {...attributes}
        {...listeners}
      >
        <Grid gap={2}>{inner}</Grid>
      </Stack>
    );
  };

  return StackWrapper(getNestedSection());
}

function areEqual(prevProps, nextProps) {
  return (
    prevProps.sectionId === nextProps.sectionId &&
    prevProps.idx === nextProps.idx
  );
}

// export default React.memo(NestedSection, areEqual);

export default React.memo(NestedSection);
