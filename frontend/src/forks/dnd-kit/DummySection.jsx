import { DragOverlay } from "forks/dnd-kit/CustomCore";
import { useDndState } from "forks/dnd-kit/dndState";
import { useReactFlow } from "forks/xyflow/core/store";
import React from "react";

export const DummySection = React.forwardRef(
  ({ forceShow, invisiblePartWidth }, ref) => {
    const zoom = useReactFlow((x) => x.transform[2]);
    const { width, height } = useDndState((x) => ({
      sectionId: x.activeId,
      width: x.width,
      height: x.height,
    }));

    const displayWidth = forceShow ? width : width * zoom;
    const displayHeight = forceShow ? height : height * zoom;

    return (
      <div className="flex">
        <div
          style={{ width: `${displayWidth}px`, height: `${displayHeight}px` }}
          className="rounded-md bg-setta-50/25"
          ref={ref}
        />
        {invisiblePartWidth && (
          <div
            style={{
              width: `${invisiblePartWidth}px`,
              height: `${displayHeight}px`,
            }}
            className="rounded-md bg-setta-100/25"
          />
        )}
      </div>
    );
  },
);

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
