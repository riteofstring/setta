import { DragOverlay } from "@dnd-kit/core";
import React from "react";
import { createPortal } from "react-dom";
import { useDndState } from "utils/DNDSortable/dndState";
import { useReactFlow } from "xyflow/core/store";
import { useDndMode } from "./useDndUtils";

export const DummySection = React.forwardRef(({ forceShow }, ref) => {
  const zoom = useReactFlow((x) => x.transform[2]);
  const { width, height } = useDndState((x) => ({
    width: x.width,
    height: x.height,
  }));

  const { isSorting } = useDndMode();

  const displayWidth = forceShow ? width : width * zoom;
  const displayHeight = forceShow ? height : height * zoom;

  return (
    <div
      style={{ width: `${displayWidth}px`, height: `${displayHeight}px` }}
      className={
        isSorting || forceShow ? "rounded-md bg-runcoder-50/25" : "opacity-0"
      }
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
        <DummySection ref={ref} />
      </DragOverlay>,
      document.body,
    )
  );
});
