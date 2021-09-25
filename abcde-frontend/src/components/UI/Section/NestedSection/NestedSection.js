import React from "react";
import { Grid, Stack, theme } from "@chakra-ui/react";
import SectionContainerWrapper from "../SectionContainer/SectionContainer";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const borderLeft = theme.colors.gray;

function _SortableNestedSection({ sectionId, ...props }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: sectionId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <NestedSection
      sectionId={sectionId}
      {...props}
      stackProps={{ style, ref: setNodeRef, ...attributes }}
      dragListeners={listeners}
    />
  );
}

function _NestedSection({
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
  stackProps,
  dragListeners,
}) {
  return (
    <Stack
      direction="column"
      pl="1rem"
      ml=".5rem"
      boxShadow={`inset 0.25rem 0px 0px 0px ${borderLeft[50]}`}
      {...stackProps}
    >
      <Grid gap={2}>
        <SectionContainerWrapper
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          sectionInfo={sectionInfo}
          available={available}
          depth={depth}
          parentControls={parentControls}
          isCollapsed={isCollapsed}
          setIdNames={setIdNames}
          dragListeners={dragListeners}
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
export const SortableNestedSection = React.memo(_SortableNestedSection);
