import { Grid, Stack, theme } from "@chakra-ui/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import React from "react";

import SectionContainer from "../SectionContainer/SectionContainer";

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
  parentControls,
  idx,
  depth,
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
        <SectionContainer
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          depth={depth}
          parentControls={parentControls}
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
