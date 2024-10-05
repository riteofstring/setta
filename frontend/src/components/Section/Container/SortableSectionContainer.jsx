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
      applyTransform={overIndex !== null && overIndex !== -1}
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
  const overIsSelf = useOverIsSelf(sectionId);
  const scaledTransform = transformWithZoom(applyTransform ? transform : null);

  const style = {
    transform: CSS.Translate.toString(scaledTransform),
    // transition,
    zIndex: overIsSelf ? 500 : undefined,
  };
  const stackProps = { style, ref: setNodeRef, ...attributes };

  return (
    <div className="relative" {...stackProps}>
      <TempSectionOrNot
        sectionId={sectionId}
        applyTransform={applyTransform}
        listeners={listeners}
      />
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

function TempSectionOrNot({ sectionId, applyTransform, listeners }) {
  if (isTempSection(sectionId)) {
    if (applyTransform) {
      return <DummySection forceShow={true} />;
    }
    return null;
  } else {
    return <SectionContainer sectionId={sectionId} dragListeners={listeners} />;
  }
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
