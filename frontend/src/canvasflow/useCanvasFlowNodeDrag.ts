import { useReactFlow } from "forks/xyflow/core/store";
import type { NodeDragItem } from "forks/xyflow/core/types";
import type {
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { useCallback, useRef } from "react";
import {
  raiseTempZIndex,
  updateNodePositions,
} from "state/actions/nodeInternals";
import { setZIndices } from "state/actions/sections/sectionPositions";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import {
  useLocalStorage,
  useMisc,
  useNodeInternals,
  useSettings,
} from "state/definitions";
import { NO_DRAG_CLASS_NAME } from "utils/constants";
import type { Position } from "utils/generatedTypes";
import {
  getCanvasFlowDragItems,
  moveCanvasFlowDragItems,
  shouldShiftCanvasFlowSelection,
} from "./canvasFlowDrag";
import type { CanvasFlowViewport } from "./canvasFlowTypes";
import { screenToWorldPoint } from "./canvasFlowViewport";

type UseCanvasFlowNodeDragParams = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  disabled?: boolean;
  nodeId?: string;
  nodeRef: RefObject<HTMLElement | null>;
  schedulePaint: () => void;
  viewportRef: MutableRefObject<CanvasFlowViewport>;
};

type CanvasFlowDragGesture = {
  dragItems: Array<NodeDragItem>;
  dragging: boolean;
  lastPointer: Position;
  pointerId: number;
  shiftsSelection: boolean;
  startClientX: number;
  startClientY: number;
};

type CanvasFlowNodeDragHandlers = {
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
};

type CanvasFlowSelectionActions = {
  setNodesSelection: (selectedNodesCount: number, ignoreGrid?: boolean) => void;
  shiftNodesSelection: (delta: Position) => void;
};

export function useCanvasFlowNodeDrag({
  canvasRef,
  disabled = false,
  nodeId,
  nodeRef,
  schedulePaint,
  viewportRef,
}: UseCanvasFlowNodeDragParams): CanvasFlowNodeDragHandlers {
  const gestureRef = useRef<CanvasFlowDragGesture | null>(null);

  const getPointerWorld = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      return screenToWorldPoint(
        {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        },
        viewportRef.current,
      );
    },
    [canvasRef, viewportRef],
  );

  const startDrag = useCallback(
    (gesture: CanvasFlowDragGesture) => {
      const activeIds = getActiveSectionUIIds();
      const nodes = useNodeInternals.getState().x;
      const dragItemParams = {
        activeIds,
        nodes,
        pointer: gesture.lastPointer,
      };
      const dragItems = getCanvasFlowDragItems(
        nodeId === undefined ? dragItemParams : { ...dragItemParams, nodeId },
      );
      if (dragItems.length === 0) {
        return false;
      }
      gesture.dragItems = dragItems;
      gesture.dragging = true;
      gesture.shiftsSelection = shouldShiftCanvasFlowSelection({
        activeIds,
        dragItems,
      });
      raiseTempZIndex(
        dragItems.flatMap((item) => {
          const node = nodes.get(item.id);
          return node ? [node] : [];
        }),
      );
      useMisc.setState({ mouseDownDraggingSection: true });
      return true;
    },
    [nodeId],
  );

  const ensureDragStarted = useCallback(
    (
      gesture: CanvasFlowDragGesture,
      event: ReactPointerEvent<HTMLElement>,
      pointer: Position,
    ) => {
      if (gesture.dragging) {
        return true;
      }
      if (!hasPassedDragThreshold(gesture, event)) {
        return false;
      }
      gesture.lastPointer = pointer;
      return startDrag(gesture);
    },
    [startDrag],
  );

  const finishDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) {
        return;
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      gestureRef.current = null;
      if (!gesture.dragging) {
        return;
      }

      const { snapGrid } = useSettings.getState().gui;
      const snapToGrid = useLocalStorage.getState().snapToGrid;
      if (snapToGrid) {
        const result = moveCanvasFlowDragItems({
          dragEnd: true,
          dragItems: gesture.dragItems,
          pointer: gesture.lastPointer,
          snapGrid,
          snapToGrid,
        });
        if (result.changed) {
          gesture.dragItems = result.dragItems;
          updateNodePositions(result.dragItems);
        }
      }

      if (gesture.shiftsSelection) {
        (
          useReactFlow.getState() as ReturnType<
            typeof useReactFlow.getState
          > &
            CanvasFlowSelectionActions
        ).setNodesSelection(getActiveSectionUIIds().length, true);
      }
      setZIndices(
        gesture.dragItems.map((item) => item.id),
        true,
      );
      schedulePaint();
      window.setTimeout(() => {
        useMisc.setState({ mouseDownDraggingSection: false });
      }, 0);
    },
    [schedulePaint],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0 || !(event.target instanceof Element)) {
        return;
      }
      const currentNode = nodeRef.current;
      if (!currentNode || event.target.closest(`.${NO_DRAG_CLASS_NAME}`)) {
        return;
      }
      const pointer = getPointerWorld(event);
      if (!pointer) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      const gesture: CanvasFlowDragGesture = {
        dragItems: [],
        dragging: false,
        lastPointer: pointer,
        pointerId: event.pointerId,
        shiftsSelection: false,
        startClientX: event.clientX,
        startClientY: event.clientY,
      };
      gestureRef.current = gesture;
      if (useReactFlow.getState().nodeDragThreshold === 0) {
        startDrag(gesture);
      }
    },
    [disabled, getPointerWorld, nodeRef, startDrag],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) {
        return;
      }
      const pointer = getPointerWorld(event);
      if (!pointer) {
        return;
      }
      if (!ensureDragStarted(gesture, event, pointer)) {
        return;
      }

      event.preventDefault();
      const delta = {
        x: pointer.x - gesture.lastPointer.x,
        y: pointer.y - gesture.lastPointer.y,
      };
      const result = moveCanvasFlowDragItems({
        dragItems: gesture.dragItems,
        pointer,
        snapGrid: useSettings.getState().gui.snapGrid,
        snapToGrid: false,
      });
      if (!result.changed) {
        return;
      }
      gesture.lastPointer = pointer;
      gesture.dragItems = result.dragItems;
      updateNodePositions(result.dragItems);
      const reactFlowState = useReactFlow.getState();
      if (gesture.shiftsSelection && reactFlowState.nodesSelectionDims) {
        (
          reactFlowState as typeof reactFlowState & CanvasFlowSelectionActions
        ).shiftNodesSelection(delta);
      }
      schedulePaint();
    },
    [ensureDragStarted, getPointerWorld, schedulePaint],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      finishDrag(event);
    },
    [finishDrag],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      finishDrag(event);
    },
    [finishDrag],
  );

  return {
    onPointerCancel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}

function hasPassedDragThreshold(
  gesture: CanvasFlowDragGesture,
  event: ReactPointerEvent<HTMLElement>,
) {
  const distance = Math.hypot(
    event.clientX - gesture.startClientX,
    event.clientY - gesture.startClientY,
  );
  return distance > useReactFlow.getState().nodeDragThreshold;
}
