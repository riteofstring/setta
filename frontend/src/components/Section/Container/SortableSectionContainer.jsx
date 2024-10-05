import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "forks/dnd-kit/CustomSortable";
import { isTempSection, useDndState } from "forks/dnd-kit/dndState";
import { DummySection } from "forks/dnd-kit/DummySection";
import { useDndProps, useOverIsSelf } from "forks/dnd-kit/useDndUtils";
import { useReactFlow } from "forks/xyflow/core/store";
import React from "react";
import { SectionContainer } from "./SectionContainer";

function _SortableSectionContainer({ sectionId, isHorizontalOrientation }) {
  const animateLayoutChanges = useAnimateLayoutChanges();
  const dndProps = useDndProps({ sectionId, isTopLevel: false });

  // remove 'role' because we don't want sections to be "role=button"
  const {
    attributes: { role, ...restAttributes },
    listeners,
    setNodeRef,
    transform,
    transition,
    overIndex,
    items,
  } = useSortable({ ...dndProps });
  return (
    <SortableCore
      sectionId={sectionId}
      attributes={restAttributes}
      listeners={listeners}
      setNodeRef={setNodeRef}
      transform={transform}
      transition={transition}
      isHorizontalOrientation={isHorizontalOrientation}
      applyTransform={
        items.length === 1 || (overIndex !== null && overIndex !== -1)
      }
    />
  );
}

export const SortableSectionContainer = React.memo(_SortableSectionContainer);

function _SortableCore({
  sectionId,
  attributes,
  listeners,
  setNodeRef,
  transform,
  transition,
  isHorizontalOrientation,
  applyTransform,
}) {
  // if (isTempSection(sectionId)) {
  //   console.log("applyTransform", applyTransform);
  // }
  const overIsSelf = useOverIsSelf(sectionId);
  const scaledTransform = transformWithZoom(applyTransform ? transform : null);

  const style = {
    transform: CSS.Translate.toString(scaledTransform),
    // transition,
    zIndex: overIsSelf ? 500 : undefined,
  };
  const stackProps = { style, ref: setNodeRef, ...attributes };

  if (isTempSection(sectionId)) {
    if (applyTransform) {
      return (
        <div className="relative" {...stackProps}>
          <DummySection forceShow={true} />
        </div>
      );
    }
    return null;
  } else {
    return (
      <div className="relative" {...stackProps}>
        <SectionContainer sectionId={sectionId} dragListeners={listeners} />
      </div>
    );
  }
}

const SortableCore = React.memo(
  _SortableCore,
  (p, n) =>
    p.sectionId === n.sectionId &&
    p.transform === n.transform &&
    p.transition === n.transition &&
    p.applyTransform === n.applyTransform,
);

function transformWithZoom(transform) {
  if (transform) {
    const zoom = useReactFlow.getState().transform[2];
    return {
      ...transform,
      x: transform.x / zoom,
      y: transform.y / zoom,
    };
  }
  return transform;
}

function useAnimateLayoutChanges() {
  const isMovingFree = useDndState((x) => x.isMovingFree);
  return () => isMovingFree;
}
