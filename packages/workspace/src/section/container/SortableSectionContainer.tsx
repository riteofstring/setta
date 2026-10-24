import _ from "lodash";
import React, {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useSortable } from "../../dnd/adapter";
import type { Transform } from "../../dnd/adapter/types";
import {
  applyZoomToTransform,
  transformToString,
} from "../../dnd/adapter/zoom";
import { isTempSection } from "../../dnd/dndIds";
import { useDndState } from "../../dnd/dndState";
import { TempDNDSection } from "../../dnd/DummySection";
import { DRAG_PREVIEW_Z_INDEX, DROP_TARGET_Z_INDEX } from "../../dnd/layers";
import { useDndProps } from "../../dnd/useDndUtils";
import type { SectionDragListeners } from "./ContainerCore";
import { useWorkspaceHost } from "../../workspaceHostContext";

export type SortableSectionRenderer = (
  sectionId: string,
  listeners: SectionDragListeners,
) => ReactNode;

function SortableSectionContainerComponent({
  renderSection,
  sectionId,
}: {
  renderSection: SortableSectionRenderer;
  sectionId: string;
}) {
  return isTempSection(sectionId) ? (
    <TempDNDSortableSectionContainer
      renderSection={renderSection}
      sectionId={sectionId}
    />
  ) : (
    <RegularSortableSectionContainer
      forceApplyTransform={false}
      renderSection={renderSection}
      sectionId={sectionId}
    />
  );
}

export const SortableSectionContainer = React.memo(
  SortableSectionContainerComponent,
);

function TempDNDSortableSectionContainerComponent({
  renderSection,
  sectionId,
}: {
  renderSection: SortableSectionRenderer;
  sectionId: string;
}) {
  const [forceApplyTransform, setForceApplyTransform] = useState(true);

  useEffect(() => {
    setForceApplyTransform(false);
  }, []);

  return (
    <RegularSortableSectionContainer
      forceApplyTransform={forceApplyTransform}
      renderSection={renderSection}
      sectionId={sectionId}
    />
  );
}

const TempDNDSortableSectionContainer = React.memo(
  TempDNDSortableSectionContainerComponent,
);

function RegularSortableSectionContainerComponent({
  forceApplyTransform,
  renderSection,
  sectionId,
}: {
  forceApplyTransform: boolean;
  renderSection: SortableSectionRenderer;
  sectionId: string;
}) {
  const dndProps = useDndProps({ sectionId, isTopLevel: false });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    overIndex,
    items,
    isDragging,
  } = useSortable(dndProps);
  const restAttributes = { ...attributes, role: undefined };
  return (
    <SortableCore
      applyTransform={
        forceApplyTransform ||
        isDragging ||
        (overIndex !== null && overIndex !== -1) ||
        (items.length === 1 &&
          items[0] === sectionId &&
          isTempSection(sectionId))
      }
      attributes={restAttributes}
      isDragging={isDragging}
      listeners={listeners}
      renderSection={renderSection}
      sectionId={sectionId}
      setNodeRef={setNodeRef}
      transform={transform}
      transition={transition}
    />
  );
}

const RegularSortableSectionContainer = React.memo(
  RegularSortableSectionContainerComponent,
);

function SortableCoreComponent({
  sectionId,
  attributes,
  listeners,
  setNodeRef,
  transform,
  transition,
  applyTransform,
  isDragging,
  renderSection,
}: {
  sectionId: string;
  attributes: Record<string, unknown>;
  listeners: SectionDragListeners;
  setNodeRef: (element: Element | null) => void;
  transform: Transform | null;
  transition: string | undefined;
  applyTransform: boolean;
  isDragging: boolean;
  renderSection: SortableSectionRenderer;
}) {
  const host = useWorkspaceHost();
  const overIsSelf = useDndState((x) => x.overId === sectionId);
  const scaledTransform = applyZoomToTransform(
    host,
    applyTransform ? transform : null,
  );

  const style: CSSProperties = {
    transform: transformToString(scaledTransform),
    transition,
    zIndex: isDragging
      ? DRAG_PREVIEW_Z_INDEX
      : overIsSelf
        ? DROP_TARGET_Z_INDEX
        : undefined,
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
        applyTransform={applyTransform}
        listeners={listeners}
        renderSection={renderSection}
        sectionId={sectionId}
      />
    </div>
  );
}

function TempSectionOrNot({
  sectionId,
  applyTransform,
  listeners,
  renderSection,
}: {
  sectionId: string;
  applyTransform: boolean;
  listeners: SectionDragListeners;
  renderSection: SortableSectionRenderer;
}) {
  if (isTempSection(sectionId)) {
    if (applyTransform) {
      return <TempDNDSection />;
    }
    return null;
  }
  return renderSection(sectionId, listeners);
}

const SortableCore = React.memo(
  SortableCoreComponent,
  (p, n) =>
    p.sectionId === n.sectionId &&
    p.transform === n.transform &&
    p.transition === n.transition &&
    p.isDragging === n.isDragging &&
    p.renderSection === n.renderSection &&
    _.isEqual(p.listeners, n.listeners),
);
