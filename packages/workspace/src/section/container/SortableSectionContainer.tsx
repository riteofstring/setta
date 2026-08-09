import _ from "lodash";
import React, { useEffect, useState, type CSSProperties } from "react";
import { useSortable } from "../../dnd/adapter";
import type { Transform } from "../../dnd/adapter/types";
import { applyZoomToTransform, transformToString } from "../../dnd/adapter/zoom";
import { isTempSection } from "../../dnd/dndIds";
import { useDndState } from "../../dnd/dndState";
import { TempDNDSection } from "../../dnd/DummySection";
import { DRAG_PREVIEW_Z_INDEX, DROP_TARGET_Z_INDEX } from "../../dnd/layers";
import { useDndProps } from "../../dnd/useDndUtils";
import type { SectionDragListeners } from "./ContainerCore";
import { SectionContainer } from "./SectionContainer";

// The reference's `SortableSectionContainer.tsx` minus the edge-handle position updates, which
// left with the excluded edge features. The reference's layout-variant class names collapse to
// the group flow the slice renders.

function SortableSectionContainerComponent({ sectionId }: { sectionId: string }) {
  return isTempSection(sectionId) ? (
    <TempDNDSortableSectionContainer sectionId={sectionId} />
  ) : (
    <RegularSortableSectionContainer sectionId={sectionId} forceApplyTransform={false} />
  );
}

export const SortableSectionContainer = React.memo(SortableSectionContainerComponent);

function TempDNDSortableSectionContainerComponent({ sectionId }: { sectionId: string }) {
  const [forceApplyTransform, setForceApplyTransform] = useState(true);

  useEffect(() => {
    // we want to force the temp section to appear on first render
    setForceApplyTransform(false);
  }, []);

  return (
    <RegularSortableSectionContainer
      sectionId={sectionId}
      forceApplyTransform={forceApplyTransform}
    />
  );
}

const TempDNDSortableSectionContainer = React.memo(TempDNDSortableSectionContainerComponent);

function RegularSortableSectionContainerComponent({
  sectionId,
  forceApplyTransform,
}: {
  sectionId: string;
  forceApplyTransform: boolean;
}) {
  const animateLayoutChanges = useAnimateLayoutChanges();
  const dndProps = useDndProps({ sectionId, isTopLevel: false });

  // remove 'role' because we don't want sections to be "role=button"
  const { attributes, listeners, setNodeRef, transform, transition, overIndex, items, isDragging } =
    useSortable({ ...dndProps, animateLayoutChanges });
  const restAttributes = { ...attributes, role: undefined };
  return (
    <SortableCore
      sectionId={sectionId}
      attributes={restAttributes}
      listeners={listeners}
      setNodeRef={setNodeRef}
      transform={transform}
      transition={transition}
      isDragging={isDragging}
      applyTransform={
        forceApplyTransform ||
        isDragging ||
        (overIndex !== null && overIndex !== -1) ||
        (items.length === 1 && items[0] === sectionId && isTempSection(sectionId))
      }
    />
  );
}

const RegularSortableSectionContainer = React.memo(RegularSortableSectionContainerComponent);

function SortableCoreComponent({
  sectionId,
  attributes,
  listeners,
  setNodeRef,
  transform,
  transition,
  applyTransform,
  isDragging,
}: {
  sectionId: string;
  attributes: Record<string, unknown>;
  listeners: SectionDragListeners;
  setNodeRef: (element: Element | null) => void;
  transform: Transform | null;
  transition: string | undefined;
  applyTransform: boolean;
  isDragging: boolean;
}) {
  const overIsSelf = useDndState((x) => x.overId === sectionId);
  const scaledTransform = applyZoomToTransform(applyTransform ? transform : null);

  const style: CSSProperties = {
    transform: transformToString(scaledTransform),
    transition,
    zIndex: isDragging ? DRAG_PREVIEW_Z_INDEX : overIsSelf ? DROP_TARGET_Z_INDEX : undefined,
  };
  const stackProps = { style, ref: setNodeRef, ...attributes };

  return (
    <div
      className="relative flex w-full outline-none"
      data-sortable-section-id={sectionId}
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

function TempSectionOrNot({
  sectionId,
  applyTransform,
  listeners,
}: {
  sectionId: string;
  applyTransform: boolean;
  listeners: SectionDragListeners;
}) {
  if (isTempSection(sectionId)) {
    if (applyTransform) {
      return <TempDNDSection />;
    }
    return null;
  }
  return <SectionContainer sectionId={sectionId} dragListeners={listeners} />;
}

const SortableCore = React.memo(
  SortableCoreComponent,
  (p, n) =>
    p.sectionId === n.sectionId &&
    p.transform === n.transform &&
    p.transition === n.transition &&
    p.isDragging === n.isDragging &&
    _.isEqual(p.listeners, n.listeners),
);

function useAnimateLayoutChanges() {
  const isSorting = useDndState((x) => x.isSorting);
  return () => isSorting;
}
