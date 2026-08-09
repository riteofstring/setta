import cc from "classcat";
import _ from "lodash";
import React, { useEffect, useRef, type KeyboardEvent } from "react";
import { NO_PAN_CLASS_NAME } from "../interaction";
import { useReactFlow } from "./store";
import type { Rect } from "./types";
import useDrag from "./useDrag";
import { updatePositions } from "./useUpdateNodePositions";
import { arrowKeyDiffs } from "./wrapNode";

function NodesSelectionComponent({ x, y, width, height }: Rect) {
  const transformString = useReactFlow(
    (s) => `translate(${s.transform[0]}px,${s.transform[1]}px) scale(${s.transform[2]})`,
  );
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    nodeRef.current?.focus({
      preventScroll: true,
    });
  }, []);

  useDrag({
    nodeRef,
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (Object.prototype.hasOwnProperty.call(arrowKeyDiffs, event.key)) {
      const diff = arrowKeyDiffs[event.key];
      if (!diff) {
        throw new Error(`Missing arrow key diff for ${event.key}.`);
      }
      updatePositions({
        x: diff.x,
        y: diff.y,
        isShiftPressed: event.shiftKey,
      });
    }
  };

  return (
    <div
      className={cc(["react-flow__nodesselection", "react-flow__container", NO_PAN_CLASS_NAME])}
      style={{
        transform: transformString,
      }}
    >
      <div
        tabIndex={-1} //needed for onKeyDown to work
        ref={nodeRef}
        role="button"
        aria-label="Selected sections"
        className="react-flow__nodesselection-rect"
        onKeyDown={onKeyDown}
        style={{
          width,
          height,
          top: y,
          left: x,
        }}
      />
    </div>
  );
}

const NodesSelection = React.memo(NodesSelectionComponent);

function NodesSelectionWrapperComponent() {
  const nodesSelectionDims = useReactFlow((s) => s.nodesSelectionDims, _.isEqual);
  return nodesSelectionDims && <NodesSelection {...nodesSelectionDims} />;
}

export const NodesSelectionWrapper = React.memo(NodesSelectionWrapperComponent);
