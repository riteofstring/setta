import { DragHandleIcon } from "@chakra-ui/icons";
import { HStack } from "@chakra-ui/react";

export function DragHandle({ dragListeners, px = "0.5rem" }) {
  return (
    <HStack
      alignSelf="stretch"
      borderLeftRadius="inherit"
      cursor="move"
      px={px}
      bg="gray.100"
      className="DragHandle"
      {...dragListeners}
    >
      <DragHandleIcon size="sm" color="gray.300" className="DragHandleIcon" />
    </HStack>
  );
}
