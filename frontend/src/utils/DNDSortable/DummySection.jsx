import { DragOverlay } from "@dnd-kit/core";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import React from "react";
import { createPortal } from "react-dom";
import { useDndState } from "utils/DNDSortable/dndState";
import { useReactFlow } from "xyflow/core/store";
import { getActualSectionId } from "./useDropType";

export const DummySection = React.forwardRef(({ forceShow }, ref) => {
  const zoom = useReactFlow((x) => x.transform[2]);
  const { width, height, dndSectionId } = useDndState((x) => ({
    dndSectionId: x.activeId,
    width: x.width,
    height: x.height,
  }));
  const parentId = useGetSectionInfo(
    getActualSectionId(dndSectionId),
    "parentId",
  );
  const isSorting = useDndState((x) => x.isSorting);
  const makeVisible = isSorting || forceShow || parentId;

  const displayWidth = forceShow ? width : width * zoom;
  const displayHeight = forceShow ? height : height * zoom;

  return (
    <div
      style={{ width: `${displayWidth}px`, height: `${displayHeight}px` }}
      className={makeVisible ? "rounded-md bg-runcoder-50/25" : "opacity-0"}
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
