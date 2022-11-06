import { Box, Grid, Stack } from "@chakra-ui/react";
import { useDroppable } from "@dnd-kit/core";
import { useHighlightDroppable } from "hooks/useDndUtils";
import SectionContainerCore from "../SectionContainerCore";

export function SectionWithChildren({
  sectionId,
  parentId,
  nextId,
  dragDropProps,
  highlightContext,
  contextStyle,
  sectionStyle,
  insertionLineStyle,
  children,
}) {
  const id = `${sectionId}-itself`;

  const { setNodeRef: droppableRef } = useDroppable({ id });
  const {
    insertionLineStyle: lineStyleForItself,
    contextStyle: contextStyleForItself,
  } = useHighlightDroppable({
    sectionId: id,
    sectionIsSameAsContext: true,
  });

  const trueContextStyle = highlightContext
    ? contextStyle
    : contextStyleForItself;

  return (
    <Grid gap={2}>
      <Stack {...trueContextStyle} {...sectionStyle} {...dragDropProps}>
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
