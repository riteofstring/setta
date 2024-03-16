import { DragOverlay } from "@dnd-kit/core";
import React from "react";
import { createPortal } from "react-dom";
import { useDndState } from "utils/DNDSortable/dndState";
import { useReactFlow } from "xyflow/core/store";

const DummySection = React.forwardRef(({ sectionId }, ref) => {
  // const { width, height } = useTrueSectionSize(sectionId);
  const [width, height] = [200, 200];
  const zoom = useReactFlow((x) => x.transform[2]);
  return (
    <div
      style={{ width: `${width * zoom}px`, height: `${height * zoom}px` }}
      className="rounded-md bg-runcoder-50/75"
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
