import { Box } from "@chakra-ui/react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDisableSort, useHighlightDroppable } from "hooks/useDndUtils";

export function DNDSortable({ sectionId, items, ...props }) {
  const highlight = useHighlightDroppable(sectionId);
  const disabled = useDisableSort(sectionId);
  return (
    <Box
      backgroundColor={highlight ? "hsla(95, 100%, 0%, 0.1)" : ""}
      borderRadius="3xl"
      outline={`${
        highlight ? "hsla(95, 100%, 50%, 1)" : "rgba(0, 0, 0, 0)"
      } solid 5px`}
      boxShadow={
        highlight
          ? "inset 3px 3px 8px rgba(0, 0, 0, 0.2), 1px 1px 10px hsla(95, 100%, 75%, 1)"
          : ""
      }
      position="relative"
      zIndex="100"
      transition="box-shadow 0.2s, background-color 0.2s, outline 0.2s"
      py="0.75rem"
      px="0.75rem"
      mx="-0.75rem"
      my="-0.75rem"
    >
      <SortableContext
        id={sectionId}
        items={items}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        {props.children}
      </SortableContext>
    </Box>
  );
}
