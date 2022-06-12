import { HStack, Box, Grid } from "@chakra-ui/react";

function Circle({ dragHandleBg = "gray.300" }) {
  return (
    <Box as="span" w="4px" h="4px" borderRadius="full" bg={dragHandleBg} />
  );
}

function DragHandleIcon({ horizontal = false, dragHandleBg }) {
  return (
    <Grid gap="0.25rem" templateColumns={`repeat(${horizontal ? 3 : 2}, 1fr)`}>
      {Array.from({ length: 6 }, (e, i) => (
        <Circle dragHandleBg={dragHandleBg} key={`draghandle-circle-${i}`} />
      ))}
    </Grid>
  );
}

export function DragHandle({
  isTopLevel,
  horizontal,
  borderRadius = "none",
  dragListeners,
  px = "0.5rem",
  dragHandleBg,
  bg = "gray.100",
  flexGrow,
  w,
  h,
  alignSelf = "stretch",
}) {
  return (
    <HStack
      alignSelf={alignSelf}
      borderLeftRadius="inherit"
      cursor="move"
      px={px}
      className={isTopLevel ? "TopLevelDragHandle" : "DragHandle"}
      bg={bg}
      borderRadius={borderRadius}
      {...dragListeners}
      flexGrow={flexGrow}
      justifyContent="center"
      w={w}
      h={h}
    >
      <DragHandleIcon horizontal={horizontal} dragHandleBg={dragHandleBg} />
    </HStack>
  );
}
