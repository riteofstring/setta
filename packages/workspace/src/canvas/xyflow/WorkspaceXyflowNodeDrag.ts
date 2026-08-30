import type { OnNodeDrag } from "@xyflow/react";
import { useCallback, useEffect, useRef } from "react";
import { createNodesMapFromDocumentChildren } from "../../document/nodeProjection";
import {
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
} from "../../document/stores";
import type { Position } from "../../document/types";
import type { WorkspaceHost } from "../../workspaceHost";
import { getDragItems } from "../dragItems";
import { getCanvasGesturesStore } from "../gestureState";
import { updateNodePositions } from "../nodeInternalsActions";
import { getReactFlowStore } from "../store";
import type { NodeDragItem } from "../types";
import { calcAutoPan, getEventPosition } from "../utils";
import type { WorkspaceXyflowSectionNode } from "./types";

type WorkspaceXyflowNodeDragOptions = {
  host: WorkspaceHost;
  onCommit?: (items: ReadonlyArray<NodeDragItem>) => void;
  onDragStateChange: (
    items: ReadonlyArray<NodeDragItem>,
    dragging: boolean,
  ) => void;
  onStart?: (items: ReadonlyArray<NodeDragItem>) => void;
};

type DragSession = {
  items: Array<NodeDragItem>;
  nodeId: string;
};

type NativeDragEvent = MouseEvent | TouchEvent;

type ClearDragOptions = {
  reconcile?: boolean;
};

function getFlowPointerPosition(
  host: WorkspaceHost,
  event: NativeDragEvent,
): Position {
  const { transform } = getReactFlowStore(host).getState();
  const pointerPosition = getEventPosition(event);

  return {
    x: (pointerPosition.x - transform[0]) / transform[2],
    y: (pointerPosition.y - transform[1]) / transform[2],
  };
}

export function useWorkspaceXyflowNodeDrag({
  host,
  onCommit,
  onDragStateChange,
  onStart,
}: WorkspaceXyflowNodeDragOptions) {
  const sessionRef = useRef<DragSession | null>(null);
  const lastPositionRef = useRef<Position | null>(null);
  const containerBoundsRef = useRef<DOMRect | null>(null);
  const mousePositionRef = useRef<Position>({ x: 0, y: 0 });
  const autoPanIdRef = useRef(0);
  const autoPanStartedRef = useRef(false);

  const updateNodes = useCallback(
    (position: Position) => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }

      let hasChange = false;
      for (const item of session.items) {
        const nextPosition = {
          x: position.x - item.distance.x,
          y: position.y - item.distance.y,
        };
        hasChange =
          hasChange ||
          item.position.x !== nextPosition.x ||
          item.position.y !== nextPosition.y;
        item.position = nextPosition;
      }
      lastPositionRef.current = position;

      if (!hasChange) {
        return;
      }

      updateNodePositions(host, session.items);
    },
    [host],
  );

  const clearDrag = useCallback(
    ({ reconcile = false }: ClearDragOptions = {}) => {
      const session = sessionRef.current;
      sessionRef.current = null;
      lastPositionRef.current = null;
      containerBoundsRef.current = null;
      mousePositionRef.current = { x: 0, y: 0 };
      autoPanStartedRef.current = false;
      cancelAnimationFrame(autoPanIdRef.current);
      autoPanIdRef.current = 0;
      getCanvasGesturesStore(host).setState({
        mouseDownDraggingSection: false,
      });
      if (session && reconcile) {
        const nodeStore = getNodeInternalsStore(host);
        nodeStore.setState({
          x: createNodesMapFromDocumentChildren(
            host,
            getWorkspaceDocumentStore(host).getState(),
            nodeStore.getState().x,
          ),
        });
      }
      if (session) {
        onDragStateChange(session.items, false);
      }
    },
    [host, onDragStateChange],
  );

  const finishDrag = useCallback(() => {
    clearDrag();
  }, [clearDrag]);

  const abortDrag = useCallback(() => {
    clearDrag({ reconcile: true });
  }, [clearDrag]);

  const autoPan = useCallback((): void => {
    if (!containerBoundsRef.current) {
      return;
    }

    const [xMovement, yMovement] = calcAutoPan(
      mousePositionRef.current,
      containerBoundsRef.current,
    );

    if (xMovement !== 0 || yMovement !== 0) {
      const { transform, panBy } = getReactFlowStore(host).getState();
      const lastPosition = lastPositionRef.current ?? { x: 0, y: 0 };
      const nextPosition = {
        x: lastPosition.x - xMovement / transform[2],
        y: lastPosition.y - yMovement / transform[2],
      };

      if (panBy({ x: xMovement, y: yMovement })) {
        updateNodes(nextPosition);
      }
    }
    autoPanIdRef.current = requestAnimationFrame(autoPan);
  }, [host, updateNodes]);

  const startAutoPanIfNeeded = useCallback(() => {
    if (
      !autoPanStartedRef.current &&
      sessionRef.current !== null &&
      getReactFlowStore(host).getState().autoPanOnNodeDrag
    ) {
      autoPanStartedRef.current = true;
      autoPan();
    }
  }, [autoPan, host]);

  const handleNodeDragStart = useCallback<
    OnNodeDrag<WorkspaceXyflowSectionNode>
  >(
    (event, node) => {
      abortDrag();
      const pointerPosition = getFlowPointerPosition(host, event);
      const items = getDragItems(
        host,
        getNodeInternalsStore(host).getState().x,
        pointerPosition,
        node.id,
      );
      if (items.length === 0) {
        return;
      }

      sessionRef.current = { items, nodeId: node.id };
      lastPositionRef.current = pointerPosition;
      containerBoundsRef.current =
        getReactFlowStore(host).getState().domNode?.getBoundingClientRect() ??
        null;
      mousePositionRef.current = getEventPosition(
        event,
        containerBoundsRef.current ?? undefined,
      );
      onStart?.(items);
      onDragStateChange(items, true);
      getCanvasGesturesStore(host).setState({
        mouseDownDraggingSection: true,
      });
    },
    [abortDrag, host, onDragStateChange, onStart],
  );

  const handleNodeDrag = useCallback<OnNodeDrag<WorkspaceXyflowSectionNode>>(
    (event, node) => {
      const session = sessionRef.current;
      if (!session || session.nodeId !== node.id) {
        return;
      }

      startAutoPanIfNeeded();
      const pointerPosition = getFlowPointerPosition(host, event);
      const lastPosition = lastPositionRef.current;
      if (
        lastPosition !== null &&
        lastPosition.x === pointerPosition.x &&
        lastPosition.y === pointerPosition.y
      ) {
        return;
      }

      mousePositionRef.current = getEventPosition(
        event,
        containerBoundsRef.current ?? undefined,
      );
      updateNodes(pointerPosition);
    },
    [host, startAutoPanIfNeeded, updateNodes],
  );

  const handleNodeDragStop = useCallback<
    OnNodeDrag<WorkspaceXyflowSectionNode>
  >(
    (_event, node) => {
      const session = sessionRef.current;
      if (!session || session.nodeId !== node.id) {
        abortDrag();
        return;
      }

      const items = session.items;
      finishDrag();
      onCommit?.(items);
    },
    [abortDrag, finishDrag, onCommit],
  );

  useEffect(
    () => () => {
      abortDrag();
    },
    [abortDrag],
  );

  return {
    handleNodeDrag,
    handleNodeDragStart,
    handleNodeDragStop,
  };
}
