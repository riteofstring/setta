import { DragHandleIcon } from "@chakra-ui/icons";
import { HStack } from "@chakra-ui/react";

export function DragHandle({ isTopLevel, dragListeners, px = "0.5rem" }) {
  return (
    <HStack
      alignSelf="stretch"
      borderLeftRadius="inherit"
      cursor="move"
      px={px}
      bg="gray.100"
      className={isTopLevel ? "TopLevelDragHandle" : "DragHandle"}
      {...dragListeners}
    >
      <DragHandleIcon size="sm" color="gray.300" className="DragHandleIcon" />
    </HStack>
  );
}
