import { DragOverlay } from "forks/dnd-kit/CustomCore";
import { useDndState } from "forks/dnd-kit/dndState";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import React from "react";
import { MINIMIZE_SECTION_HEIGHT } from "utils/constants";

export const TempDNDSection = React.forwardRef(({}, ref) => {
  const { width, height, highestAncestorWidth } = useDndState(
    (x) => ({
      width: x.width,
      height: x.height,
      highestAncestorWidth: x.highestAncestorWidth[x.overId],
    }),
    _.isEqual,
  );

  // console.log("highestAncestorWidth", highestAncestorWidth)

  return (
    <div className="flex">
      <div
        style={{ width: `${width}px`, height: `${MINIMIZE_SECTION_HEIGHT}px` }}
        className="rounded-md bg-setta-50/25"
        ref={ref}
      />
      {highestAncestorWidth && (
        <div
          // style={{
          //   width: `${highestAncestorWidth.width - highestAncestorWidth.depth * 56 - displayWidth}px`,
          //   height: `${displayHeight}px`,
          // }}
          style={{
            width: "200px",
            height: `${MINIMIZE_SECTION_HEIGHT}px`,
          }}
          className="rounded-md bg-setta-100/25"
        />
      )}
    </div>
  );
});

export const DummySection = React.forwardRef(({}, ref) => {
  const zoom = useReactFlow((x) => x.transform[2]);
  const { width, height } = useDndState(
    (x) => ({
      width: x.width,
      height: x.height,
    }),
    _.isEqual,
  );

  const displayWidth = width * zoom;
  const displayHeight = height * zoom;

  return (
    <div className="flex">
      <div
        style={{
          width: `${displayWidth}px`,
          height: `${MINIMIZE_SECTION_HEIGHT * zoom}px`,
        }}
        className="rounded-md bg-setta-50/25"
        ref={ref}
      />
    </div>
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
