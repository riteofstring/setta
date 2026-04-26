import cc from "classcat";
import { useDndMode } from "forks/dnd-kit/dndState";
import {
  setSelectionDragHandle,
  setSelectionDragPrimaryId,
} from "forks/dnd-kit/selectionDragHandle";
import useDrag from "forks/xyflow/core/hooks/useDrag";
import { useGpuFlowViewportStore } from "gpuFlow/viewportHooks";
import _ from "lodash";
import React, {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { openSelectionContextMenu } from "state/actions/contextMenus";
import { getNodes } from "state/actions/nodeInternals";
import {
  getActiveSectionUIIds,
  useActiveSectionUI,
} from "state/activeSectionUI";
import { NO_PAN_CLASS_NAME } from "utils/constants";
import { updatePositions } from "../hooks/useUpdateNodePositions";
import type { Rect } from "../types";
import { arrowKeyDiffs } from "./wrapNode";

function _NodesSelection({ x, y, width, height }: Rect) {
  const transformString = useGpuFlowViewportStore(
    (s) =>
      `translate(${s.transform[0]}px,${s.transform[1]}px) scale(${s.transform[2]})`,
  );
  const { isSorting, isMovingFree } = useDndMode();
  const activeIds = useActiveSectionUI((state) => state.activeIds, _.isEqual);
  const nodeRef = useRef<HTMLDivElement>(null);
  const primarySelectionId =
    activeIds.length > 0 ? activeIds[activeIds.length - 1] : null;

  useEffect(() => {
    nodeRef.current?.focus({
      preventScroll: true,
    });
  }, []);

  useEffect(() => {
    setSelectionDragPrimaryId(primarySelectionId);
  }, [primarySelectionId]);

  useEffect(() => {
    return () => {
      setSelectionDragPrimaryId(null);
    };
  }, []);

  useDrag({
    nodeRef,
  });

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const activeSectionIds = getActiveSectionUIIds();
    const selectedNodeIds = getNodes()
      .filter((n) => activeSectionIds.includes(n.id))
      .map((n) => n.id);
    openSelectionContextMenu(event, selectedNodeIds);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (Object.prototype.hasOwnProperty.call(arrowKeyDiffs, event.key)) {
      updatePositions({
        x: arrowKeyDiffs[event.key].x,
        y: arrowKeyDiffs[event.key].y,
        isShiftPressed: event.shiftKey,
      });
    }
  };

  return (
    <div
      className={cc([
        "react-flow__nodesselection",
        "react-flow__container",
        NO_PAN_CLASS_NAME,
      ])}
      style={{
        transform: transformString,
      }}
    >
      <div
        tabIndex={-1} //needed for onKeyDown to work
        ref={nodeRef}
        className="react-flow__nodesselection-rect"
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        style={{
          width,
          height,
          top: y,
          left: x,
          pointerEvents: isSorting || isMovingFree ? "none" : undefined,
        }}
      />
    </div>
  );
}

function _NodesSelectionDragHandle({ x, y, width, height }: Rect) {
  const transformString = useGpuFlowViewportStore(
    (s) =>
      `translate(${s.transform[0]}px,${s.transform[1]}px) scale(${s.transform[2]})`,
  );
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectionDragHandle(nodeRef.current);
    return () => {
      setSelectionDragHandle(null);
    };
  }, []);

  return (
    <div
      className={cc([
        "react-flow__nodesselection-hitbox",
        "react-flow__container",
        NO_PAN_CLASS_NAME,
      ])}
      style={{
        transform: transformString,
      }}
    >
      <div
        ref={nodeRef}
        className="react-flow__nodesselection-hitbox-rect"
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

function _NodesSelectionWrapper() {
  const nodesSelectionBounds = useGpuFlowViewportStore(
    (s) => s.nodesSelectionBounds,
    _.isEqual,
  );
  return nodesSelectionBounds && <NodesSelection {...nodesSelectionBounds} />;
}
function _NodesSelectionDragHandleWrapper() {
  const nodesSelectionBounds = useGpuFlowViewportStore(
    (s) => s.nodesSelectionBounds,
    _.isEqual,
  );
  const { isMovingFree } = useDndMode();
  if (!nodesSelectionBounds || !isMovingFree) {
    return null;
  }
  return <NodesSelectionDragHandle {...nodesSelectionBounds} />;
}
const NodesSelection = React.memo(_NodesSelection);
const NodesSelectionDragHandle = React.memo(_NodesSelectionDragHandle);
export const NodesSelectionWrapper = React.memo(_NodesSelectionWrapper);
export const NodesSelectionDragHandleWrapper = React.memo(
  _NodesSelectionDragHandleWrapper,
);
