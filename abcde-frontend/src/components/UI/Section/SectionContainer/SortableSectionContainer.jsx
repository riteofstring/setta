import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import React from "react";
import { useStore } from "reactflow";
import SectionContainer from "./SectionContainer";

function _SortableSectionContainer({
  sectionId,
  parentId,
  nextId,
  ancestorSet,
}) {
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
    data: { zoom, isTopLevel: false },
  });

  const { attributes, listeners, setNodeRef, transform, transition } =
    sortableProps;

  const scaledTransform = transformWithZoom(transform);

  const style = {
    transform: CSS.Translate.toString(scaledTransform),
    transition,
  };
  const stackProps = { style, ref: setNodeRef, ...attributes };

  return (
    <div className="first:mt-2" {...stackProps}>
      <SectionContainer
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        ancestorSet={ancestorSet}
        dragListeners={listeners}
      />
    </div>
  );
}

export const SortableSectionContainer = React.memo(_SortableSectionContainer);
