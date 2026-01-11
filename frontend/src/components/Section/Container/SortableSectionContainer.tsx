import { useSortable } from "forks/dnd-kit/adapter";
import { applyZoomToTransform, transformToString } from "forks/dnd-kit/adapter/zoom";
import { useDndState } from "forks/dnd-kit/dndState";
import { useDndProps } from "forks/dnd-kit/useDndUtils";
import _ from "lodash";
import React, { useEffect } from "react";
import { scheduleEdgeHandlePositionUpdate } from "state/actions/edgeHandles";
import { SectionContainer } from "./SectionContainer";

function _SortableSectionContainer({ sectionId }) {
  const dndProps = useDndProps(sectionId);

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
}) {
  const overIsSelf = useDndState((x) => x.overId === sectionId);
  const scaledTransform = applyZoomToTransform(transform);
  const transformX = scaledTransform ? scaledTransform.x : null;
  const transformY = scaledTransform ? scaledTransform.y : null;
  const transformScaleX = scaledTransform ? scaledTransform.scaleX : null;
  const transformScaleY = scaledTransform ? scaledTransform.scaleY : null;
  const hasTransform = scaledTransform !== null;

  useEffect(() => {
    scheduleEdgeHandlePositionUpdate([sectionId]);
  }, [
    hasTransform,
    sectionId,
    transition,
    transformX,
    transformY,
    transformScaleX,
    transformScaleY,
  ]);

  const style = {
    transform: transformToString(scaledTransform),
    transition,
    zIndex: overIsSelf ? 500 : undefined,
  };
  const stackProps = { style, ref: setNodeRef, ...attributes };

  return (
    <div
      className="relative flex w-full outline-none"
      {...stackProps}
      tabIndex={-1}
    >
      <SectionContainer sectionId={sectionId} dragListeners={listeners} />
    </div>
  );
}

const SortableCore = React.memo(
  _SortableCore,
  (p, n) =>
    p.sectionId === n.sectionId &&
    p.transform === n.transform &&
    p.transition === n.transition &&
    _.isEqual(p.listeners, n.listeners),
);
