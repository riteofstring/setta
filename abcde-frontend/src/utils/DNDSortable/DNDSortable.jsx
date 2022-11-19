import { Box } from "@chakra-ui/react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDisableSort, useHighlightDroppable } from "hooks/useDndUtils";

export function DNDSortable({ sectionId, items, ...props }) {
  const style = useHighlightDroppable(sectionId);
  const disabled = useDisableSort(sectionId);
  return (
    <Box {...style}>
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
