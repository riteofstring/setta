import cc from "classcat";
import { useDndMode } from "forks/dnd-kit/dndState";
import {
  setSelectionDragHandle,
  setSelectionDragPrimaryId,
} from "forks/dnd-kit/selectionDragHandle";
import { updatePositions } from "forks/xyflow/core/hooks/useUpdateNodePositions";
import { useReactFlow } from "forks/xyflow/core/store";
import type { Rect } from "forks/xyflow/core/types";
import _ from "lodash";
import React, {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
  type RefObject,
} from "react";
import { openSelectionContextMenu } from "state/actions/contextMenus";
import { getNodes } from "state/actions/nodeInternals";
import {
  getActiveSectionUIIds,
  useActiveSectionUI,
} from "state/activeSectionUI";
import { NO_PAN_CLASS_NAME } from "utils/constants";
import type { CanvasFlowViewport } from "./canvasFlowTypes";
import { useCanvasFlowNodeDrag } from "./useCanvasFlowNodeDrag";

type CanvasFlowSelectionProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  schedulePaint: () => void;
  viewportRef: MutableRefObject<CanvasFlowViewport>;
};

const arrowKeyDiffs = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

function _CanvasFlowNodesSelection({
  canvasRef,
  height,
  schedulePaint,
  viewportRef,
  width,
  x,
  y,
}: Rect & CanvasFlowSelectionProps) {
  const transformString = useReactFlow(
    (state) =>
      `translate(${state.transform[0]}px,${state.transform[1]}px) scale(${state.transform[2]})`,
  );
  const { isSorting, isMovingFree } = useDndMode();
  const activeIds = useActiveSectionUI((state) => state.activeIds, _.isEqual);
  const nodeRef = useRef<HTMLDivElement>(null);
  const primarySelectionId =
    activeIds.length > 0 ? (activeIds[activeIds.length - 1] ?? null) : null;
  const dragHandlers = useCanvasFlowNodeDrag({
    canvasRef,
    disabled: isSorting || isMovingFree,
    nodeRef,
    schedulePaint,
    viewportRef,
  });

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

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const activeSectionIds = getActiveSectionUIIds();
    const selectedNodeIds = getNodes()
      .filter((node) => activeSectionIds.includes(node.id))
      .map((node) => node.id);
    openSelectionContextMenu(event, selectedNodeIds);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const diff = arrowKeyDiffs[event.key];
    if (!diff) {
      return;
    }
    updatePositions({
      x: diff.x,
      y: diff.y,
      isShiftPressed: event.shiftKey,
    });
    schedulePaint();
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
        {...dragHandlers}
        className="react-flow__nodesselection-rect"
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        ref={nodeRef}
        style={{
          height,
          left: x,
          pointerEvents: isSorting || isMovingFree ? "none" : undefined,
          top: y,
          width,
        }}
        tabIndex={-1}
      />
    </div>
  );
}

function _CanvasFlowNodesSelectionDragHandle({
  height,
  width,
  x,
  y,
}: Rect) {
  const transformString = useReactFlow(
    (state) =>
      `translate(${state.transform[0]}px,${state.transform[1]}px) scale(${state.transform[2]})`,
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
        className="react-flow__nodesselection-hitbox-rect"
        ref={nodeRef}
        style={{
          height,
          left: x,
          top: y,
          width,
        }}
      />
    </div>
  );
}

function _CanvasFlowNodesSelectionWrapper({
  canvasRef,
  schedulePaint,
  viewportRef,
}: CanvasFlowSelectionProps) {
  const nodesSelectionDims = useReactFlow(
    (state) => state.nodesSelectionDims,
    _.isEqual,
  );
  if (!nodesSelectionDims) {
    return null;
  }
  return (
    <CanvasFlowNodesSelection
      {...nodesSelectionDims}
      canvasRef={canvasRef}
      schedulePaint={schedulePaint}
      viewportRef={viewportRef}
    />
  );
}

function _CanvasFlowNodesSelectionDragHandleWrapper() {
  const nodesSelectionDims = useReactFlow(
    (state) => state.nodesSelectionDims,
    _.isEqual,
  );
  const { isMovingFree } = useDndMode();
  if (!nodesSelectionDims || !isMovingFree) {
    return null;
  }
  return <CanvasFlowNodesSelectionDragHandle {...nodesSelectionDims} />;
}

const CanvasFlowNodesSelection = React.memo(_CanvasFlowNodesSelection);
const CanvasFlowNodesSelectionDragHandle = React.memo(
  _CanvasFlowNodesSelectionDragHandle,
);
export const CanvasFlowNodesSelectionWrapper = React.memo(
  _CanvasFlowNodesSelectionWrapper,
);
export const CanvasFlowNodesSelectionDragHandleWrapper = React.memo(
  _CanvasFlowNodesSelectionDragHandleWrapper,
);
