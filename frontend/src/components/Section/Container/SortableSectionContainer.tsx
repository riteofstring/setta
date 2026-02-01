import { useSortable } from "forks/dnd-kit/adapter";
import {
  applyZoomToTransform,
  transformToString,
} from "forks/dnd-kit/adapter/zoom";
import { isTempSection, useDndState } from "forks/dnd-kit/dndState";
import { TempDNDSection } from "forks/dnd-kit/DummySection";
import { useDndProps } from "forks/dnd-kit/useDndUtils";
import _ from "lodash";
import React, { useEffect, useState } from "react";
import { scheduleEdgeHandlePositionUpdate } from "state/actions/edgeHandles";
import { SectionContainer } from "./SectionContainer";

function _SortableSectionContainer({ sectionId, className }) {
  return isTempSection(sectionId) ? (
    <TempDNDSortableSectionContainer
      sectionId={sectionId}
      className={className}
    />
  ) : (
    <RegularSortableSectionContainer
      sectionId={sectionId}
      className={className}
      forceApplyTransform={false}
    />
  );
}

export const SortableSectionContainer = React.memo(_SortableSectionContainer);

function _TempDNDSortableSectionContainer({ sectionId, className }) {
  const [forceApplyTransform, setForceApplyTransform] = useState(true);

  useEffect(() => {
    // we want to force the temp section to appear on first render
    setForceApplyTransform(false);
  }, []);

  return (
    <RegularSortableSectionContainer
      sectionId={sectionId}
      className={className}
      forceApplyTransform={forceApplyTransform}
    />
  );
}

const TempDNDSortableSectionContainer = React.memo(
  _TempDNDSortableSectionContainer,
);

function _RegularSortableSectionContainer({
  sectionId,
  forceApplyTransform,
  className,
}) {
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
    isDragging,
  } = useSortable({ ...dndProps, animateLayoutChanges });
  return (
    <SortableCore
      sectionId={sectionId}
      attributes={restAttributes}
      listeners={listeners}
      setNodeRef={setNodeRef}
      transform={transform}
      transition={transition}
      isDragging={isDragging}
      className={className}
      applyTransform={
        forceApplyTransform ||
        isDragging ||
        (overIndex !== null && overIndex !== -1) ||
        (items.length === 1 &&
          items[0] === sectionId &&
          isTempSection(sectionId))
      }
    />
  );
}

const RegularSortableSectionContainer = React.memo(
  _RegularSortableSectionContainer,
);

function _SortableCore({
  sectionId,
  attributes,
  listeners,
  setNodeRef,
  transform,
  transition,
  applyTransform,
  isDragging,
  className,
}) {
  const overIsSelf = useDndState((x) => x.overId === sectionId);
  const scaledTransform = applyZoomToTransform(
    applyTransform ? transform : null,
  );
  const transformX = scaledTransform ? scaledTransform.x : null;
  const transformY = scaledTransform ? scaledTransform.y : null;
  const transformScaleX = scaledTransform ? scaledTransform.scaleX : null;
  const transformScaleY = scaledTransform ? scaledTransform.scaleY : null;
  const hasTransform = scaledTransform !== null;

  useEffect(() => {
    scheduleEdgeHandlePositionUpdate([sectionId]);
  }, [
    applyTransform,
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
    zIndex: isDragging ? 1000 : overIsSelf ? 500 : undefined,
  };
  const stackProps = { style, ref: setNodeRef, ...attributes };

  return (
    <div
      className={`relative flex w-full outline-none ${className ?? ""}`}
      {...stackProps}
      tabIndex={-1}
    >
      <TempSectionOrNot
        sectionId={sectionId}
        applyTransform={applyTransform}
        listeners={listeners}
      />
    </div>
  );
}

function TempSectionOrNot({ sectionId, applyTransform, listeners }) {
  if (isTempSection(sectionId)) {
    if (applyTransform) {
      return <TempDNDSection />;
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
    p.transition === n.transition &&
    p.isDragging === n.isDragging &&
    p.className === n.className &&
    _.isEqual(p.listeners, n.listeners),
);

function useAnimateLayoutChanges() {
  const isSorting = useDndState((x) => x.isSorting);
  return () => isSorting;
}
