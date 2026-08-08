import { DragDropProvider, DragOverlay, useDraggable, useDroppable } from "@dnd-kit/react";
import { useCallback, type ReactNode } from "react";

export type AdapterDndCompletion = {
  sourceId: string;
  targetId: string | null;
  canceled: boolean;
};

export type UpstreamDndBoundaryProps = {
  children: ReactNode;
  onStart?(sourceId: string): void;
  onPreviewTarget?(targetId: string | null): void;
  onComplete(completion: AdapterDndCompletion): void;
};

function stringId(id: string | number | undefined): string | null {
  return id === undefined ? null : String(id);
}

export function UpstreamDndBoundary({
  children,
  onStart,
  onPreviewTarget,
  onComplete,
}: UpstreamDndBoundaryProps) {
  return (
    <DragDropProvider
      onDragStart={({ operation }) => {
        const sourceId = stringId(operation.source?.id);
        if (sourceId) {
          onStart?.(sourceId);
        }
      }}
      onDragOver={({ operation }) => {
        onPreviewTarget?.(stringId(operation.target?.id));
      }}
      onDragEnd={({ canceled, operation }) => {
        onPreviewTarget?.(null);
        const sourceId = stringId(operation.source?.id);
        if (!sourceId) {
          throw new Error("The completed dnd-kit operation has no source ID.");
        }
        onComplete({ sourceId, targetId: stringId(operation.target?.id), canceled });
      }}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {(source) => (
          <div aria-hidden="true" className="setta-adapter-proof__drag-overlay">
            Moving {String(source.id)}
          </div>
        )}
      </DragOverlay>
    </DragDropProvider>
  );
}

export type UpstreamDndItemProps = {
  children?: ReactNode;
  id: string;
  label: string;
  onElement?(element: HTMLElement | null): void;
  onSelect(additive: boolean): void;
  rootSectionId: string;
  selected: boolean;
};

export function UpstreamDndItem({
  children,
  id,
  label,
  onElement,
  onSelect,
  rootSectionId,
  selected,
}: UpstreamDndItemProps) {
  const data = { sectionId: id, rootSectionId };
  const draggable = useDraggable({ id, data });
  const droppable = useDroppable({ id, data });
  const draggableRef = draggable.ref;
  const droppableRef = droppable.ref;
  const setElement = useCallback(
    (element: HTMLElement | null) => {
      draggableRef(element);
      droppableRef(element);
      onElement?.(element);
    },
    [draggableRef, droppableRef, onElement],
  );

  return (
    <article
      className="setta-adapter-proof__nested-section"
      data-drag-source={draggable.isDragSource ? "true" : "false"}
      data-drop-target={droppable.isDropTarget ? "true" : "false"}
      data-proof-section-id={id}
      data-selected={selected ? "true" : "false"}
      ref={setElement}
    >
      <div className="setta-adapter-proof__nested-header">
        <button
          aria-pressed={selected}
          className="nodrag nowheel nopan setta-adapter-proof__nested-select"
          onClick={(event) => onSelect(event.shiftKey)}
          type="button"
        >
          {label}
        </button>
        <button
          aria-label={`Move ${label}`}
          className="nodrag nowheel nopan setta-adapter-proof__nested-handle"
          ref={draggable.handleRef}
          type="button"
        >
          Move
        </button>
      </div>
      {children}
    </article>
  );
}
