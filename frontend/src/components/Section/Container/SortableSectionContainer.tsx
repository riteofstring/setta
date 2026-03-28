import { useSortable } from "forks/dnd-kit/adapter";
import {
  applyZoomToTransform,
  transformToString,
} from "forks/dnd-kit/adapter/zoom";
import { isTempSection, useDndState } from "forks/dnd-kit/dndState";
import { useDndProps } from "forks/dnd-kit/useDndUtils";
import _ from "lodash";
import React, { useEffect, useState } from "react";
import { scheduleEdgeHandlePositionUpdate } from "state/actions/edgeHandles";
import type { SectionContainerCoreBodyRenderer } from "./SectionContainer";
import { SortableSectionBody } from "./SortableSectionBody";
import { SortableSectionSection } from "./SortableSectionSection";
import type { SortableSectionNestedSectionsRenderer } from "./sortableSectionBodyView";

type SortableSectionContainerProps = {
  sectionId: string;
  className?: string;
  renderCoreBody: SectionContainerCoreBodyRenderer;
  renderNestedSections: SortableSectionNestedSectionsRenderer;
};

type RegularSortableSectionContainerProps = SortableSectionContainerProps & {
  forceApplyTransform: boolean;
};

type SortableHookResult = ReturnType<typeof useSortable>;

type SortableCoreProps = SortableSectionContainerProps & {
  applyTransform: boolean;
  attributes: SortableHookResult["attributes"];
  listeners: SortableHookResult["listeners"];
  setNodeRef: SortableHookResult["setNodeRef"];
  transform: SortableHookResult["transform"];
  transition: SortableHookResult["transition"];
  isDragging: boolean;
};

function _SortableSectionContainer({
  sectionId,
  className,
  renderCoreBody,
  renderNestedSections,
}: SortableSectionContainerProps) {
  return isTempSection(sectionId) ? (
    <TempDNDSortableSectionContainer
      sectionId={sectionId}
      className={className}
      renderCoreBody={renderCoreBody}
      renderNestedSections={renderNestedSections}
    />
  ) : (
    <RegularSortableSectionContainer
      sectionId={sectionId}
      className={className}
      forceApplyTransform={false}
      renderCoreBody={renderCoreBody}
      renderNestedSections={renderNestedSections}
    />
  );
}

export const SortableSectionContainer = React.memo(_SortableSectionContainer);

function _TempDNDSortableSectionContainer({
  sectionId,
  className,
  renderCoreBody,
  renderNestedSections,
}: SortableSectionContainerProps) {
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
      renderCoreBody={renderCoreBody}
      renderNestedSections={renderNestedSections}
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
  renderCoreBody,
  renderNestedSections,
}: RegularSortableSectionContainerProps) {
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
      renderCoreBody={renderCoreBody}
      renderNestedSections={renderNestedSections}
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
  renderCoreBody,
  renderNestedSections,
}: SortableCoreProps) {
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
      data-sortable-section-id={sectionId}
      {...stackProps}
      tabIndex={-1}
    >
      <SortableSectionBody
        sectionId={sectionId}
        applyTransform={applyTransform}
        listeners={listeners}
        SectionBoundary={SortableSectionSection}
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
      />
    </div>
  );
}

const SortableCore = React.memo(
  _SortableCore,
  (p, n) =>
    p.renderCoreBody === n.renderCoreBody &&
    p.renderNestedSections === n.renderNestedSections &&
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
