import { DragOverlay } from "@dnd-kit/core";
import React from "react";
import { createPortal } from "react-dom";
import { useDndState } from "utils/DNDSortable/dndState";
import { useReactFlow } from "xyflow/core/store";
import { useDndMode } from "./useDndUtils";

const DummySection = React.forwardRef(({ sectionId }, ref) => {
  const { width, height } = useDndState((x) => ({
    width: x.width,
    height: x.height,
  }));
  const zoom = useReactFlow((x) => x.transform[2]);
  const { isSorting } = useDndMode();
  return (
    <div
      style={{ width: `${width * zoom}px`, height: `${height * zoom}px` }}
      className={isSorting ? "rounded-md bg-runcoder-50/25" : "opacity-0"}
      ref={ref}
    />
  );
});

export const DummyDragOverlay = React.forwardRef((props, ref) => {
  const activeId = useDndState((x) => x.activeId);

  return (
    activeId &&
    createPortal(
      <DragOverlay dropAnimation={null}>
        <DummySection sectionId={activeId} ref={ref} />
      </DragOverlay>,
      document.body,
    )
  );
});
