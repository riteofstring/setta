import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import React, { useEffect } from "react";
import { isTempSection, useDndState } from "utils/DNDSortable/dndState";
import { DummySection } from "utils/DNDSortable/DummySection";
import {
  useDndMode,
  useDndProps,
  useOverIsSelf,
} from "utils/DNDSortable/useDndUtils";
import { useReactFlow } from "xyflow/core/store";
import { SectionContainer } from "./SectionContainer";

function _SortableSectionContainer({ sectionId }) {
  const animateLayoutChanges = useAnimateLayoutChanges();
  const dndProps = useDndProps({ sectionId, isTopLevel: false });

  // remove 'role' because we don't want sections to be "role=button"
  const {
    attributes: { role, ...restAttributes },
    listeners,
    setNodeRef,
    transform,
    transition,
    setActivatorNodeRef,
  } = useSortable({ ...dndProps });

  useEffect(() => {
    if (isTempSection(sectionId)) {
      console.log("setting setActivatorNodeRef", sectionId);
      useDndState.setState({ setActivatorNodeRef });
    }
  }, [setActivatorNodeRef]);

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
  const overIsSelf = useOverIsSelf(sectionId);
  const scaledTransform = transformWithZoom(transform);

  const style = {
    transform: CSS.Translate.toString(scaledTransform),
    transition,
    zIndex: overIsSelf ? 500 : undefined,
  };
  const stackProps = { style, ref: setNodeRef, ...attributes };

  return (
    <div className="relative first:mt-2" {...stackProps}>
      {isTempSection(sectionId) ? (
        <DummySection forceShow={true} />
      ) : (
        <SectionContainer sectionId={sectionId} dragListeners={listeners} />
      )}
    </div>
  );
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
  const { isMovingFree } = useDndMode();
  return () => isMovingFree;
}
