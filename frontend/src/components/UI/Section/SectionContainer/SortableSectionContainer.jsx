import { CSS } from "@dnd-kit/utilities";
import React from "react";
import { useSortable } from "utils/DNDSortable/CustomSortable";
import { isTempSection, useDndState } from "utils/DNDSortable/dndState";
import { DummySection } from "utils/DNDSortable/DummySection";
import { useDndProps, useOverIsSelf } from "utils/DNDSortable/useDndUtils";
import { useReactFlow } from "xyflow/core/store";
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
}) {
  const overIsSelf = useOverIsSelf(sectionId);
  const scaledTransform = transformWithZoom(transform);

  const style = {
    transform: CSS.Translate.toString(scaledTransform),
    // transition,
    zIndex: overIsSelf ? 500 : undefined,
  };
  const stackProps = { style, ref: setNodeRef, ...attributes };

  return (
    <div className="relative" {...stackProps}>
      {isTempSection(sectionId) ? (
        <DummySection forceShow={true} />
      ) : (
        <SectionContainer sectionId={sectionId} dragListeners={listeners} />
      )}
    </div>
  );

  // return isTempSection(sectionId) ? (
  //   <div className="relative first:mt-2">
  //     <DummySection forceShow={true} />
  //   </div>
  // ) : (
  //   <div className="relative first:mt-2" {...stackProps}>
  //     <SectionContainer sectionId={sectionId} dragListeners={listeners} />
  //   </div>
  // );
}

const SortableCore = React.memo(
  _SortableCore,
  (p, n) =>
    p.sectionId === n.sectionId &&
    p.transform === n.transform &&
    p.transition === n.transition,
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
