import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import React from "react";
import { useStore } from "react-flow-renderer";
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

  const sortableProps = useSortable({
    id: sectionId,
    data: { zoom },
  });

  // Possible TODO:
  // Use isOver (available in sortableProps) to do some styling when
  // another element is hovering over this element.
  const { attributes, listeners, setNodeRef, transform, transition } =
    sortableProps;

  const scaledTransform = transformWithZoom(transform);

  const style = {
    transform: CSS.Translate.toString(scaledTransform),
    transition,
  };
  const stackProps = { style, ref: setNodeRef, ...attributes };

  return (
    <div className="mt-2" {...stackProps}>
      <SectionContainer
        sectionId={sectionId}
        {...props}
        dragListeners={listeners}
      />
    </div>
  );
}

export const SortableSectionContainer = React.memo(_SortableSectionContainer);
