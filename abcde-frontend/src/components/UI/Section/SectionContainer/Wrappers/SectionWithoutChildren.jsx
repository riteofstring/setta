import { Grid, Stack } from "@chakra-ui/react";
import SectionContainerCore from "../SectionContainerCore";

export function SectionWithoutChildren({
  sectionId,
  parentId,
  nextId,
  dragDropProps,
  contextStyle,
  sectionStyle,
  insertionLineStyle,
  children,
}) {
  return (
    <Grid gap={2}>
      <Stack {...contextStyle} {...sectionStyle} {...dragDropProps}>
        <SectionContainerCore
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          hasNested={false}
        />
        {children}
      </Stack>
      <div style={insertionLineStyle} />
    </Grid>
  );
}
