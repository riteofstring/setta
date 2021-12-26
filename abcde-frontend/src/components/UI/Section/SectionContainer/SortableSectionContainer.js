import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import React from "react";
import { useScaledSortable } from "../../../../hooks/useScaledSortable";

import SectionContainer from "./SectionContainer";

function _SortableSectionContainer({ sectionId, ...props }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useScaledSortable({ id: sectionId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const stackProps = { style, ref: setNodeRef, ...attributes };

  return (
    <div {...stackProps}>
      <SectionContainer
        sectionId={sectionId}
        {...props}
        dragListeners={listeners}
      />
    </div>
  );
}

export const SortableSectionContainer = React.memo(_SortableSectionContainer);
