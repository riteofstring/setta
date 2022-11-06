import { Box, Grid, Stack } from "@chakra-ui/react";
import { useDroppable } from "@dnd-kit/core";
import { useHighlightDroppable } from "hooks/useDndUtils";
import SectionContainerCore from "../SectionContainerCore";

export function SectionWithChildren({
  sectionId,
  parentId,
  nextId,
  dragDropProps,
  contextStyle,
  sectionStyle,
  insertionLineStyle,
  children,
}) {
  const id = `${sectionId}-itself`;

  const { setNodeRef: droppableRef } = useDroppable({ id });
  const { insertionLineStyle: lineStyleForItself } = useHighlightDroppable({
    sectionId: id,
    sectionIsSameAsContext: false,
  });

  return (
    <Grid gap={2}>
      <Stack {...contextStyle} {...sectionStyle} {...dragDropProps}>
        <Box ref={droppableRef}>
          <SectionContainerCore
            sectionId={sectionId}
            parentId={parentId}
            nextId={nextId}
            hasNested={true}
          />
        </Box>
        <div style={lineStyleForItself} />
        {children}
      </Stack>
      <div style={insertionLineStyle} />
    </Grid>
  );
}
