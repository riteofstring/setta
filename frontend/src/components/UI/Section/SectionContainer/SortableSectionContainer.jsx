import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDndMode, useDndProps, useOverIsSelf } from "hooks/useDndUtils";
import React from "react";
import { REACT_FLOW_STORE } from "utils/constants";
import { SectionContainer } from "./SectionContainer";

function _SortableSectionContainer({ sectionId, nextId, ancestorSet }) {
  const animateLayoutChanges = useAnimateLayoutChanges();
  const dndProps = useDndProps({ sectionId, isTopLevel: false });

  // remove 'role' because we don't want sections to be "role=button"
  const {
    attributes: { role, ...restAttributes },
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ ...dndProps, animateLayoutChanges });
  return (
    <SortableCore
      sectionId={sectionId}
      nextId={nextId}
      ancestorSet={ancestorSet}
      attributes={restAttributes}
      listeners={listeners}
      setNodeRef={setNodeRef}
      transform={transform}
      transition={transition}
    />
  );
}

export const SortableSectionContainer = React.memo(_SortableSectionContainer);

function _SortableCore({
  sectionId,
  nextId,
  ancestorSet,
  attributes,
  listeners,
  setNodeRef,
  transform,
  transition,
}) {
  const overIsSelf = useOverIsSelf(sectionId);
  const store = REACT_FLOW_STORE.store;
  const scaledTransform = transformWithZoom(transform, store);

  const style = {
    transform: CSS.Translate.toString(scaledTransform),
    transition,
    zIndex: overIsSelf ? 500 : undefined,
  };
  const stackProps = { style, ref: setNodeRef, ...attributes };

  return (
    <div className="relative first:mt-2" {...stackProps}>
      <SectionContainer
        sectionId={sectionId}
        nextId={nextId}
        ancestorSet={ancestorSet}
        dragListeners={listeners}
      />
    </div>
  );
}

const SortableCore = React.memo(
  _SortableCore,
  (p, n) =>
    p.sectionId === n.sectionId &&
    p.nextId === n.nextId &&
    p.ancestorSet === n.ancestorSet &&
    p.transform === n.transform &&
    p.transition === n.transition
);

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

function useAnimateLayoutChanges() {
  const { isMovingFree } = useDndMode();
  return () => isMovingFree;
}
