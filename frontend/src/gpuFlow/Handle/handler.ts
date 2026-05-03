import type {
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from "react";

import type {
  Connection,
  GpuFlowAutoPanInsetsInput,
  GpuFlowAutoPanInsetsPx,
  GpuFlowConnectionContext,
  HandleConnectionCandidateFilter,
  HandleType,
} from "../flowTypes";
import { GPU_FLOW_CLASS_NAMES } from "../gpuFlowDomClasses";
import { getGpuNodeDragAutoPanDelta } from "../interactions/nodeDrag";
import type { GpuFlowLayoutStoreApi } from "../layoutStore";
import {
  buildGpuFlowPortEndpoints,
  makeGpuFlowPortKey,
  useGpuFlowPortRegistry,
} from "../ports/portGeometry";
import { getGpuPortAnchorHandleType, type GpuFlowScene } from "../scene";
import { panGpuViewport } from "../viewportActions";
import {
  flowToScreenPosition,
  screenToFlowPosition,
  type GpuPoint,
} from "../viewportMath";
import type {
  GpuConnectionState,
  GpuFlowViewportStoreApi,
} from "../viewportStore";
import {
  getClosestHandle,
  getConnectionStatus,
  getHandleLookup,
  getHandleType,
  isValidHandle,
  resetRecentHandle,
  type ConnectionHandle,
  type ValidConnectionFunc,
} from "./utils";

type HandlePointerEvent = ReactMouseEvent | ReactTouchEvent;
type NativeHandlePointerEvent = MouseEvent | PointerEvent | TouchEvent;
type GpuHandlePointerStartEvent = HandlePointerEvent | NativeHandlePointerEvent;

export function handlePointerDown({
  event,
  getScene,
  handleId,
  layoutStore,
  nodeId,
  onConnect,
  isTarget,
  store,
  isConnectionCandidateAllowed,
  isValidConnection,
  edgeUpdaterType,
  onReconnectEnd,
  pointerUpSnapRadius,
  autoPanInsetsPx,
}: {
  event: GpuHandlePointerStartEvent;
  getScene?: (() => GpuFlowScene | null | undefined) | undefined;
  handleId: string | null;
  layoutStore: GpuFlowLayoutStoreApi | null | undefined;
  nodeId: string;
  onConnect: (
    connection: Connection,
    context?: GpuFlowConnectionContext,
  ) => void;
  isTarget: boolean;
  store: GpuFlowViewportStoreApi;
  isConnectionCandidateAllowed?: HandleConnectionCandidateFilter | undefined;
  isValidConnection: ValidConnectionFunc;
  edgeUpdaterType?: HandleType | undefined;
  onReconnectEnd?: ((evt: MouseEvent | TouchEvent) => void) | undefined;
  pointerUpSnapRadius?: number | undefined;
  autoPanInsetsPx?: GpuFlowAutoPanInsetsInput | undefined;
}): void {
  const doc = getHostForElement(event.target as HTMLElement);
  const usePointerEvents = isNativePointerEvent(event);
  const { connectionMode, domNode, autoPanOnConnect, connectionRadius } =
    store.getState();
  let autoPanId = 0;
  let closestHandle: ConnectionHandle | null = null;

  const { x, y } = getEventPosition(event);
  const clickedHandle = doc.elementFromPoint(x, y);
  const handleType = getHandleType(edgeUpdaterType, clickedHandle);
  const containerBounds = domNode?.getBoundingClientRect();

  if (!layoutStore) {
    throw new Error("GpuFlow handle connections require a layout store.");
  }

  if (!containerBounds || !handleType) {
    return;
  }

  let prevActiveHandle: Element | null = null;
  let connectionPosition = getEventPosition(event, containerBounds);
  let autoPanStarted = false;
  let connection: Connection | null = null;
  let isValid = false;
  let handleDomNode: Element | null = null;
  let connectionGestureCleanedUp = false;

  const getConnectionContext = (): GpuFlowConnectionContext => ({
    scene: getGpuHandleConnectionScene(getScene),
  });
  const handlePositions = getConnectionHandlePositions({
    layoutStore,
    scene: getConnectionContext().scene,
  });

  const handleLookup = getHandleLookup(
    handlePositions,
    handleId ? makeGpuFlowPortKey(nodeId, handleId, handleType) : null,
  );
  const fromType: HandleType = isTarget ? "target" : "source";
  const validateHandle = (
    handle: Pick<
      ConnectionHandle,
      "isConnectableEnd" | "portId" | "sectionId" | "type"
    >,
  ) =>
    isValidHandle({
      handle,
      connectionMode,
      from: {
        sectionId: nodeId,
        handleId,
        type: fromType,
      },
      isValidConnection,
      doc,
    });
  const allowHandle = isConnectionCandidateAllowed ?? null;

  const getClosestHandleForEvent = ({
    event,
    position,
    radius,
  }: {
    event: NativeHandlePointerEvent;
    position: GpuPoint;
    radius: number;
  }) =>
    getClosestHandle({
      event,
      doc,
      pos: screenToFlowPosition(position, store.getState().transform),
      connectionRadius: radius,
      handles: handleLookup,
      allowHandle,
      validator: validateHandle,
    });

  const autoPan = (): void => {
    if (!autoPanOnConnect) {
      return;
    }
    const delta = getGpuNodeDragAutoPanDelta({
      insetsPx: resolveGpuHandleAutoPanInsetsPx(autoPanInsetsPx),
      point: connectionPosition,
      viewportSize: {
        height: containerBounds.height,
        width: containerBounds.width,
      },
    });

    panGpuViewport(delta, { store });
    autoPanId = requestAnimationFrame(autoPan);
  };

  const setConnectionPreview = ({
    nextClosestHandle,
    nextIsValid,
    endHandle,
  }: {
    nextClosestHandle: ConnectionHandle | null;
    nextIsValid: boolean;
    endHandle: GpuConnectionState["connectionEndHandle"];
  }) => {
    const nextConnectionPosition =
      nextClosestHandle && nextIsValid
        ? flowToScreenPosition(
            {
              x: nextClosestHandle.x,
              y: nextClosestHandle.y,
            },
            store.getState().transform,
          )
        : connectionPosition;

    store.getState().setConnectionState({
      connectionPosition: nextConnectionPosition,
      connectionStatus: getConnectionStatus(!!nextClosestHandle, nextIsValid),
      connectionEndHandle: endHandle,
    });
  };

  const updateActiveHandlePreview = ({
    nextClosestHandle,
    nextIsValid,
    nextConnection,
    nextHandleDomNode,
  }: {
    nextClosestHandle: ConnectionHandle | null;
    nextIsValid: boolean;
    nextConnection: Connection | null;
    nextHandleDomNode: Element | null;
  }) => {
    if (!nextClosestHandle && !nextIsValid && !nextHandleDomNode) {
      resetRecentHandle(prevActiveHandle);
      return;
    }

    if (
      nextConnection?.source === nextConnection?.target ||
      !nextHandleDomNode
    ) {
      return;
    }

    resetRecentHandle(prevActiveHandle);
    prevActiveHandle = nextHandleDomNode;
    nextHandleDomNode.classList.add(
      "connecting",
      GPU_FLOW_CLASS_NAMES.handleConnecting,
    );
    nextHandleDomNode.classList.toggle("valid", nextIsValid);
    nextHandleDomNode.classList.toggle(
      GPU_FLOW_CLASS_NAMES.handleValid,
      nextIsValid,
    );
  };

  const resolvePointerUpState = (
    event: NativeHandlePointerEvent,
  ): {
    closestHandle: ConnectionHandle | null;
    connection: Connection | null;
    isValid: boolean;
  } => {
    const snapRadius = getPointerUpSnapRadius(
      pointerUpSnapRadius,
      connectionRadius,
    );
    if (closestHandle || snapRadius === null) {
      return {
        closestHandle,
        connection,
        isValid,
      };
    }

    const snapped = getClosestHandleForEvent({
      event,
      position: getEventPosition(event, containerBounds),
      radius: snapRadius,
    });

    return {
      closestHandle: snapped.handle,
      connection: snapped.validHandleResult.connection,
      isValid: snapped.validHandleResult.isValid,
    };
  };

  store.getState().setConnectionState({
    connectionPosition,
    connectionStatus: null,
    connectionStartHandle: {
      sectionId: nodeId,
      handleId,
      type: handleType,
    },
    connectionEndHandle: null,
  });

  function onPointerMove(event: NativeHandlePointerEvent) {
    connectionPosition = getEventPosition(event, containerBounds);

    const { handle, validHandleResult } = getClosestHandleForEvent({
      event,
      position: connectionPosition,
      radius: connectionRadius,
    });

    closestHandle = handle;

    if (!autoPanStarted) {
      autoPan();
      autoPanStarted = true;
    }

    handleDomNode = validHandleResult.handleDomNode;
    connection = validHandleResult.connection;
    isValid = validHandleResult.isValid;

    setConnectionPreview({
      nextClosestHandle: closestHandle,
      nextIsValid: isValid,
      endHandle: validHandleResult.endHandle
        ? {
            sectionId: validHandleResult.endHandle.sectionId,
            handleId: validHandleResult.endHandle.handleId,
            type: validHandleResult.endHandle.type,
          }
        : null,
    });
    updateActiveHandlePreview({
      nextClosestHandle: closestHandle,
      nextIsValid: isValid,
      nextConnection: connection,
      nextHandleDomNode: handleDomNode,
    });
  }

  function cleanupConnectionGesture() {
    if (connectionGestureCleanedUp) {
      return;
    }
    connectionGestureCleanedUp = true;

    resetRecentHandle(prevActiveHandle);
    store.getState().cancelConnection();
    cancelAnimationFrame(autoPanId);
    autoPanStarted = false;
    isValid = false;
    connection = null;
    handleDomNode = null;

    doc.removeEventListener("mousemove", onPointerMove as EventListener);
    doc.removeEventListener("mouseup", onPointerUp as EventListener);

    doc.removeEventListener("touchmove", onPointerMove as EventListener);
    doc.removeEventListener("touchend", onPointerUp as EventListener);
    doc.removeEventListener("touchcancel", onConnectionCancel as EventListener);

    if (usePointerEvents) {
      doc.removeEventListener("pointermove", onPointerMove as EventListener);
      doc.removeEventListener("pointerup", onPointerUp as EventListener);
    }
    doc.removeEventListener("pointercancel", onConnectionCancel, true);
    doc.removeEventListener("keydown", onKeyDown as EventListener, true);
  }

  function onConnectionCancel(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    cleanupConnectionGesture();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") {
      return;
    }
    onConnectionCancel(event);
  }

  function onPointerUp(event: NativeHandlePointerEvent) {
    const {
      closestHandle: resolvedClosestHandle,
      connection: resolvedConnection,
      isValid: resolvedIsValid,
    } = resolvePointerUpState(event);

    if (
      (resolvedClosestHandle || handleDomNode) &&
      resolvedConnection &&
      resolvedIsValid
    ) {
      onConnect?.(resolvedConnection, getConnectionContext());
    }

    if (edgeUpdaterType) {
      onReconnectEnd?.(event);
    }

    cleanupConnectionGesture();
  }

  doc.addEventListener("mousemove", onPointerMove as EventListener);
  doc.addEventListener("mouseup", onPointerUp as EventListener);

  doc.addEventListener("touchmove", onPointerMove as EventListener);
  doc.addEventListener("touchend", onPointerUp as EventListener);
  doc.addEventListener("touchcancel", onConnectionCancel as EventListener);

  if (usePointerEvents) {
    doc.addEventListener("pointermove", onPointerMove as EventListener);
    doc.addEventListener("pointerup", onPointerUp as EventListener);
  }
  doc.addEventListener("pointercancel", onConnectionCancel, true);
  doc.addEventListener("keydown", onKeyDown as EventListener, true);
}

function getGpuHandleConnectionScene(
  getScene: (() => GpuFlowScene | null | undefined) | undefined,
): GpuFlowScene | null | undefined {
  return getScene ? getScene() : undefined;
}

function getConnectionHandlePositions({
  layoutStore,
  scene,
}: {
  readonly layoutStore: GpuFlowLayoutStoreApi;
  readonly scene: GpuFlowScene | null | undefined;
}): ConnectionHandle[] {
  const endpoints = buildGpuFlowPortEndpoints({
    layoutNodes: layoutStore.getState().getNodes(),
    ports: useGpuFlowPortRegistry.getState().descriptors,
  });
  const handlesByKey = new Map<string, ConnectionHandle>();
  for (const endpoint of Object.values(endpoints)) {
    const handle = {
      sectionId: endpoint.nodeId,
      portId: endpoint.portId,
      type: endpoint.type,
      x: endpoint.x,
      y: endpoint.y,
    };
    handlesByKey.set(getConnectionHandleKey(handle), handle);
  }
  for (const handle of getSceneConnectionHandlePositions(scene)) {
    handlesByKey.set(getConnectionHandleKey(handle), handle);
  }
  return Array.from(handlesByKey.values());
}

function getSceneConnectionHandlePositions(
  scene: GpuFlowScene | null | undefined,
): ConnectionHandle[] {
  if (!scene) {
    return [];
  }
  return [
    ...getSectionSceneConnectionHandlePositions(scene.sections),
    ...getRetainedContentSceneConnectionHandlePositions(scene.contentSurfaces),
  ];
}

function getSectionSceneConnectionHandlePositions(
  sections: GpuFlowScene["sections"],
): ConnectionHandle[] {
  const handles: ConnectionHandle[] = [];
  for (const section of sections) {
    for (const anchor of section.portAnchors) {
      const type = getGpuPortAnchorHandleType(anchor);
      if (!type) {
        continue;
      }
      handles.push({
        isConnectableEnd: anchor.isConnectableEnd ?? true,
        portId: anchor.id,
        sectionId: section.sectionId,
        type,
        x: section.worldRect.x + anchor.localPosition.x,
        y: section.worldRect.y + anchor.localPosition.y,
      });
    }
  }
  return handles;
}

function getRetainedContentSceneConnectionHandlePositions(
  contentSurfaces: GpuFlowScene["contentSurfaces"],
): ConnectionHandle[] {
  const handles: ConnectionHandle[] = [];
  for (const surface of contentSurfaces) {
    const retainedScene = surface.retainedScene;
    if (surface.renderer.kind !== "canvas-content" || !retainedScene) {
      continue;
    }
    for (const anchor of retainedScene.portAnchors) {
      handles.push({
        isConnectableEnd: true,
        portId: anchor.id,
        sectionId: surface.ownerSectionId,
        type: anchor.kind === "input" ? "target" : "source",
        x: surface.rect.x + anchor.localPosition.x,
        y: surface.rect.y + anchor.localPosition.y,
      });
    }
  }
  return handles;
}

function getConnectionHandleKey(
  handle: Pick<ConnectionHandle, "portId" | "sectionId" | "type">,
): string {
  return handle.portId && handle.type
    ? makeGpuFlowPortKey(handle.sectionId, handle.portId, handle.type)
    : `${handle.sectionId}:${handle.portId ?? ""}:${handle.type ?? ""}`;
}

function getEventPosition(
  event: GpuHandlePointerStartEvent,
  bounds?: DOMRect,
): GpuPoint {
  const point = getClientPoint(event);
  return {
    x: point.x - (bounds?.left ?? 0),
    y: point.y - (bounds?.top ?? 0),
  };
}

function getClientPoint(event: GpuHandlePointerStartEvent): GpuPoint {
  if ("clientX" in event) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }
  const touch = event.touches[0] ?? event.changedTouches[0];
  return {
    x: touch?.clientX ?? 0,
    y: touch?.clientY ?? 0,
  };
}

function getHostForElement(element: HTMLElement): Document | ShadowRoot {
  return (element.getRootNode?.() as Document | ShadowRoot) || window.document;
}

function isNativePointerEvent(
  event: GpuHandlePointerStartEvent,
): event is PointerEvent {
  return (
    typeof PointerEvent !== "undefined" &&
    event instanceof PointerEvent &&
    event.type.startsWith("pointer")
  );
}

function getPointerUpSnapRadius(
  pointerUpSnapRadius: number | null | undefined,
  connectionRadius: number,
): number | null {
  if (
    pointerUpSnapRadius === null ||
    pointerUpSnapRadius === undefined ||
    !Number.isFinite(pointerUpSnapRadius) ||
    pointerUpSnapRadius <= 0
  ) {
    return null;
  }
  return Math.max(connectionRadius, pointerUpSnapRadius);
}

function resolveGpuHandleAutoPanInsetsPx(
  input: GpuFlowAutoPanInsetsInput,
): GpuFlowAutoPanInsetsPx | undefined {
  const resolved = typeof input === "function" ? input() : input;
  return resolved ?? undefined;
}
