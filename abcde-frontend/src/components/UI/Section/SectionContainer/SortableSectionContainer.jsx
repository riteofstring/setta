import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import _ from "lodash";
import { useDndState } from "models/info/dndState";
import React from "react";
import { useStoreApi } from "react-flow-renderer";
import { SectionContainer } from "./SectionContainer";

function _SortableSectionContainer({
  sectionId,
  parentId,
  nextId,
  ancestorSet,
}) {
  const sortableProps = useSortable({
    id: sectionId,
    data: { isTopLevel: false },
  });
  return (
    <SortableCore
      sortableProps={sortableProps}
      sectionId={sectionId}
      parentId={parentId}
      nextId={nextId}
      ancestorSet={ancestorSet}
    />
  );
}

export const SortableSectionContainer = React.memo(_SortableSectionContainer);

function _SortableCore({
  sectionId,
  parentId,
  nextId,
  ancestorSet,
  sortableProps,
}) {
  const overIsSelf = useDndState((x) => x.over === sectionId);
  const store = useStoreApi();

  const { attributes, listeners, setNodeRef, transform, transition } =
    sortableProps;

  const scaledTransform = transformWithZoom(transform, store);

  const style = {
    transform: CSS.Translate.toString(scaledTransform),
    transition,
    zIndex: overIsSelf ? 500 : 0,
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

const SortableCore = React.memo(_SortableCore, _.isEqual);

function transformWithZoom(transform, store) {
  if (transform) {
    const zoom = store.getState().transform[2];
    return {
      ...transform,
      x: transform.x / zoom,
      y: transform.y / zoom,
    };
  }
  return transform;
}
