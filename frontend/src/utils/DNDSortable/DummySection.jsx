import React from "react";
import { DragOverlay } from "utils/DNDSortable/CustomCore";
import { useDndState } from "utils/DNDSortable/dndState";
import { useReactFlow } from "xyflow/core/store";

export const DummySection = React.forwardRef(({ forceShow }, ref) => {
  const zoom = useReactFlow((x) => x.transform[2]);
  const { width, height } = useDndState((x) => ({
    sectionId: x.activeId,
    width: x.width,
    height: x.height,
  }));

  const displayWidth = forceShow ? width : width * zoom;
  const displayHeight = forceShow ? height : height * zoom;

  return (
    <div
      style={{ width: `${displayWidth}px`, height: `${displayHeight}px` }}
      className="rounded-md bg-setta-50/25"
      ref={ref}
    />
  );
});

export const DummyDragOverlay = React.forwardRef((props, ref) => {
  const activeId = useDndState((x) => x.activeId);

  return (
    activeId && (
      <DragOverlay dropAnimation={null}>
        <DummySection ref={ref} />
      </DragOverlay>
    )
  );
});
