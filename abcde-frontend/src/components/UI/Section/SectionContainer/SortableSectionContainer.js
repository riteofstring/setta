import { useDraggable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import React from "react";
import { useKeyPress, useStore } from "react-flow-renderer";

import SectionContainer from "./SectionContainer";

function _SortableSectionContainer({ sectionId, ...props }) {
  const zoom = useStore((x) => x.transform[2]);

  function transformWithZoom(transform) {
    if (transform) {
      return {
        ...transform,
        x: transform.x / zoom,
        y: transform.y / zoom,
      };
    }
    return transform;
  }

  const dragKeyPressed = useKeyPress("Alt");
  const sortKeyPressed = useKeyPress("Control");

  const draggableProps = useDraggable({
    id: `${sectionId}-draggable`,
    disabled: !dragKeyPressed,
  });

  const sortableProps = useSortable({
    id: sectionId,
    disabled: dragKeyPressed,
  });

  const { attributes, listeners, setNodeRef, transform, transition } =
    dragKeyPressed ? draggableProps : sortableProps;

  const scaledTransform = transformWithZoom(transform);

  const style = {
    transform: CSS.Translate.toString(scaledTransform),
    transition,
  };
  const stackProps = { style, ref: setNodeRef, ...attributes };

  return (
    <div {...stackProps}>
      <SectionContainer
        sectionId={sectionId}
        {...props}
        dragListeners={listeners}
        dragKeyPressed={dragKeyPressed}
        sortKeyPressed={sortKeyPressed}
      />
    </div>
  );
}

export const SortableSectionContainer = React.memo(_SortableSectionContainer);
