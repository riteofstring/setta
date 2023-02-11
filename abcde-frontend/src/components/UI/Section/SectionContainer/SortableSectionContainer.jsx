import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DropType, useHighlightDroppable } from "hooks/useDndUtils";
import _ from "lodash";
import React from "react";
import { useStoreApi } from "react-flow-renderer";
import { SectionContainer } from "./SectionContainer";

function _SortableSectionContainer({
  sectionId,
  parentId,
  nextId,
  ancestorSet,
}) {
  const { highlight } = useHighlightDroppable(sectionId);
  const zIndex =
    highlight === DropType.ABOVE || highlight === DropType.BELOW
      ? "z-[500]"
      : "";
  return (
    <SortableInfo
      sectionId={sectionId}
      parentId={parentId}
      nextId={nextId}
      ancestorSet={ancestorSet}
      zIndex={zIndex}
    />
  );
}

export const SortableSectionContainer = React.memo(_SortableSectionContainer);

function _SortableInfo(props) {
  const sortableProps = useSortable({
    id: props.sectionId,
    data: { isTopLevel: false },
  });
  return <SortableCore sortableProps={sortableProps} {...props} />;
}

export const SortableInfo = React.memo(_SortableInfo, _.isEqual);

function _SortableCore({
  sectionId,
  parentId,
  nextId,
  ancestorSet,
  zIndex,
  sortableProps,
}) {
  const store = useStoreApi();

  const { attributes, listeners, setNodeRef, transform, transition } =
    sortableProps;

  const scaledTransform = transformWithZoom(transform, store);

  const style = {
    transform: CSS.Translate.toString(scaledTransform),
    transition,
  };
  const stackProps = { style, ref: setNodeRef, ...attributes };

  return (
    <div className={`first:mt-2 ${zIndex}`} {...stackProps}>
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
