import type {
  Connection,
  ConnectionMode,
  HandleConnectionCandidate,
  HandleType,
} from "../flowTypes";
import { GPU_FLOW_CLASS_NAMES, GPU_FLOW_SELECTORS } from "../gpuFlowDomClasses";
import {
  getGpuFlowPortDescriptor,
  makeGpuFlowPortKey,
} from "../ports/portGeometry";

export type ConnectionHandle = {
  isConnectableEnd?: boolean | undefined;
  sectionId: string;
  portId: string | null;
  type: HandleType | null;
  x: number;
  y: number;
};

export type ValidConnectionFunc = (connection: Connection) => boolean;

const nullConnection: Connection = {
  source: null,
  target: null,
  sourceHandle: null,
  targetHandle: null,
};

const defaultResult = () => ({
  handleDomNode: null,
  isValid: false,
  connection: nullConnection,
  endHandle: null,
});

type Result = {
  handleDomNode: Element | null;
  isValid: boolean;
  connection: Connection;
  endHandle: {
    sectionId: string;
    handleId: string | null;
    type: HandleType;
  } | null;
};

type HandleRef = Pick<
  ConnectionHandle,
  "isConnectableEnd" | "portId" | "sectionId" | "type"
>;

type ConnectionStart = {
  sectionId: string;
  handleId: string | null;
  type: HandleType;
};

type HandleValidationArgs = {
  handle: HandleRef;
  connectionMode: ConnectionMode;
  from: ConnectionStart;
  isValidConnection: ValidConnectionFunc;
  doc: Document | ShadowRoot;
};

type ResolvedHandleTarget = {
  handleDomNode: Element | null;
  handleId: string | null;
  handleSectionId: string | null;
  handleType: HandleType | null;
  isConnectableEnd: boolean;
};

type AllowHandleFunc = ((handle: HandleConnectionCandidate) => boolean) | null;

type ClosestHandleResult = {
  handle: ConnectionHandle | null;
  validHandleResult: Result;
};

type ClosestHandleMatch = {
  handle: ConnectionHandle;
  validHandleResult: Result;
};

type ClosestHandleArgs = {
  event: MouseEvent | TouchEvent;
  doc: Document | ShadowRoot;
  pos: { x: number; y: number };
  connectionRadius: number;
  handles: ConnectionHandle[];
  allowHandle: AllowHandleFunc;
  validator: (handle: HandleRef) => Result;
};

export function getHandleLookup(
  handles: ConnectionHandle[],
  currentHandleKey: string | null,
) {
  if (!currentHandleKey) {
    return handles;
  }
  return handles.filter(
    (handle) =>
      handle.portId === null ||
      handle.type === null ||
      makeGpuFlowPortKey(handle.sectionId, handle.portId, handle.type) !==
        currentHandleKey,
  );
}

export function getHandleType(
  edgeUpdaterType: HandleType | undefined,
  handleDomNode: Element | null,
) {
  if (edgeUpdaterType) {
    return edgeUpdaterType;
  }
  if (handleDomNode?.classList.contains("target")) {
    return "target";
  }
  if (handleDomNode?.classList.contains("source")) {
    return "source";
  }
  return null;
}

export function resetRecentHandle(handleDomNode: Element | null): void {
  handleDomNode?.classList.remove(
    "valid",
    "connecting",
    GPU_FLOW_CLASS_NAMES.handleValid,
    GPU_FLOW_CLASS_NAMES.handleConnecting,
  );
}

export function getConnectionStatus(
  isInsideConnectionRadius: boolean,
  isHandleValid: boolean,
) {
  let connectionStatus: "valid" | "invalid" | null = null;

  if (isHandleValid) {
    connectionStatus = "valid";
  } else if (isInsideConnectionRadius && !isHandleValid) {
    connectionStatus = "invalid";
  }

  return connectionStatus;
}

function getDefaultResult(handleDomNode: Element | null = null): Result {
  return {
    ...defaultResult(),
    handleDomNode,
  };
}

function getHandleSelector(handle: HandleRef): string {
  return `${GPU_FLOW_SELECTORS.handle}[data-id="${handle.sectionId}-${handle.portId}-${handle.type}"]`;
}

function resolveHandleTarget({
  doc,
  handle,
}: {
  doc: Document | ShadowRoot;
  handle: HandleRef;
}): ResolvedHandleTarget {
  return (
    resolveExplicitHandleTarget(handle) ??
    resolveDomOrRegisteredHandleTarget({ doc, handle })
  );
}

function resolveDomOrRegisteredHandleTarget({
  doc,
  handle,
}: {
  doc: Document | ShadowRoot;
  handle: HandleRef;
}): ResolvedHandleTarget {
  const handleToCheck = doc.querySelector(getHandleSelector(handle));
  if (handleToCheck) {
    return {
      handleDomNode: handleToCheck,
      handleId: handleToCheck.getAttribute("data-handleid"),
      handleSectionId: handleToCheck.getAttribute("data-nodeid"),
      handleType: getHandleType(undefined, handleToCheck),
      isConnectableEnd:
        handleToCheck.classList.contains("connectable") &&
        handleToCheck.classList.contains("connectableend"),
    };
  }

  const registeredHandle = getRegisteredHandle(handle);
  const registeredElement = registeredHandle?.element;
  if (
    !registeredHandle ||
    !registeredElement ||
    !doc.contains(registeredElement)
  ) {
    if (handle.isConnectableEnd !== undefined) {
      return {
        handleDomNode: null,
        handleId: handle.portId,
        handleSectionId: handle.sectionId,
        handleType: handle.type,
        isConnectableEnd: handle.isConnectableEnd,
      };
    }
    return {
      handleDomNode: null,
      handleId: null,
      handleSectionId: null,
      handleType: null,
      isConnectableEnd: false,
    };
  }

  return {
    handleDomNode: registeredElement,
    handleId: registeredHandle.portId,
    handleSectionId: registeredHandle.nodeId,
    handleType: registeredHandle.type,
    isConnectableEnd: registeredHandle.isConnectableEnd ?? true,
  };
}

function resolveExplicitHandleTarget(
  handle: HandleRef,
): ResolvedHandleTarget | null {
  if (handle.isConnectableEnd === undefined) {
    return null;
  }
  return {
    handleDomNode: null,
    handleId: handle.portId,
    handleSectionId: handle.sectionId,
    handleType: handle.type,
    isConnectableEnd: handle.isConnectableEnd,
  };
}

function getRegisteredHandle(handle: HandleRef) {
  if (!handle.portId || !handle.type) {
    return null;
  }
  return getGpuFlowPortDescriptor({
    nodeId: handle.sectionId,
    portId: handle.portId,
    type: handle.type,
  });
}

function buildConnection(
  from: ConnectionStart,
  handleSectionId: string | null,
  handleId: string | null,
): Connection {
  const isTarget = from.type === "target";
  return {
    source: isTarget ? handleSectionId : from.sectionId,
    sourceHandle: isTarget ? handleId : from.handleId,
    target: isTarget ? from.sectionId : handleSectionId,
    targetHandle: isTarget ? from.handleId : handleId,
  };
}

function canConnectHandle({
  connectionMode,
  from,
  handleSectionId,
  handleId,
  handleType,
  isConnectable,
}: {
  connectionMode: ConnectionMode;
  from: ConnectionStart;
  handleSectionId: string | null;
  handleId: string | null;
  handleType: HandleType | null;
  isConnectable: boolean;
}): boolean {
  if (!isConnectable) {
    return false;
  }

  if (connectionMode === "strict") {
    return from.type === "target"
      ? handleType === "source"
      : handleType === "target";
  }

  return handleSectionId !== from.sectionId || handleId !== from.handleId;
}

export function isValidHandle({
  handle,
  connectionMode,
  from,
  isValidConnection,
  doc,
}: HandleValidationArgs) {
  const resolvedHandle = resolveHandleTarget({ doc, handle });
  const result = getDefaultResult(resolvedHandle.handleDomNode);

  const { handleId, handleSectionId, handleType } = resolvedHandle;
  if (!handleSectionId || !handleType) {
    return result;
  }

  const connection = buildConnection(from, handleSectionId, handleId);
  result.connection = connection;

  if (
    !canConnectHandle({
      connectionMode,
      from,
      handleSectionId,
      handleId,
      handleType,
      isConnectable: resolvedHandle.isConnectableEnd,
    })
  ) {
    return result;
  }

  result.endHandle = {
    sectionId: handleSectionId as string,
    handleId,
    type: handleType as HandleType,
  };
  result.isValid = isValidConnection(connection);

  return result;
}

function isHandleAllowed(
  allowHandle: AllowHandleFunc,
  handle: Pick<ConnectionHandle, "sectionId" | "portId" | "type">,
): boolean {
  return (
    allowHandle?.({
      handleId: handle.portId,
      sectionId: handle.sectionId,
      type: handle.type,
    }) ?? true
  );
}

function getMatchingConnectionHandle(
  handle: HandleRef,
  handles: ConnectionHandle[],
): ConnectionHandle | null {
  return (
    handles.find(
      (entry) =>
        entry.sectionId === handle.sectionId &&
        entry.type === handle.type &&
        entry.portId === handle.portId,
    ) ?? null
  );
}

function getHandleBelowPointer({
  event,
  doc,
}: Pick<ClosestHandleArgs, "event" | "doc">): Element | undefined {
  const eventPos = getPointerPosition(event);
  return doc
    .elementsFromPoint(eventPos.x, eventPos.y)
    .find((el) => el.classList.contains(GPU_FLOW_CLASS_NAMES.handle));
}

function resolveHandleBelowPointer(
  args: ClosestHandleArgs,
): ClosestHandleResult | null {
  const handleBelow = getHandleBelowPointer(args);
  const handleSectionId = handleBelow?.getAttribute("data-nodeid");

  if (!handleBelow || !handleSectionId) {
    return null;
  }

  const handleType = getHandleType(undefined, handleBelow);
  const handleId = handleBelow.getAttribute("data-handleid");
  const handle = {
    sectionId: handleSectionId,
    portId: handleId,
    type: handleType,
  };

  if (!isHandleAllowed(args.allowHandle, handle)) {
    return null;
  }

  const connectionHandle = getMatchingConnectionHandle(handle, args.handles);
  if (!connectionHandle) {
    return null;
  }

  return {
    handle: connectionHandle,
    validHandleResult: args.validator(handle),
  };
}

function getHandleDistance(
  handle: ConnectionHandle,
  pos: { x: number; y: number },
): number {
  return Math.hypot(handle.x - pos.x, handle.y - pos.y);
}

function collectClosestHandleMatches(
  args: Pick<
    ClosestHandleArgs,
    "allowHandle" | "connectionRadius" | "handles" | "pos" | "validator"
  >,
): ClosestHandleMatch[] {
  let closestHandles: ClosestHandleMatch[] = [];
  let minDistance = Infinity;

  for (const handle of args.handles) {
    if (!isHandleAllowed(args.allowHandle, handle)) {
      continue;
    }

    const distance = getHandleDistance(handle, args.pos);
    if (distance > args.connectionRadius || distance > minDistance) {
      continue;
    }

    const validHandleResult = args.validator(handle);

    if (distance < minDistance) {
      closestHandles = [{ handle, validHandleResult }];
      minDistance = distance;
      continue;
    }

    closestHandles.push({ handle, validHandleResult });
  }

  return closestHandles;
}

function isPreferredClosestHandle(
  match: ClosestHandleMatch,
  preferTargetHandle: boolean,
  requireValidHandle: boolean,
): boolean {
  if (preferTargetHandle && match.handle.type !== "target") {
    return false;
  }

  if (requireValidHandle && !match.validHandleResult.isValid) {
    return false;
  }

  return true;
}

function pickClosestHandle(
  closestHandles: ClosestHandleMatch[],
): ClosestHandleResult {
  const firstHandle = closestHandles[0];
  if (!firstHandle) {
    return { handle: null, validHandleResult: getDefaultResult() };
  }

  if (closestHandles.length === 1) {
    return firstHandle;
  }

  const preferTargetHandle = closestHandles.some(
    ({ handle }) => handle.type === "target",
  );
  const requireValidHandle = closestHandles.some(
    ({ validHandleResult }) => validHandleResult.isValid,
  );

  return (
    closestHandles.find((match) =>
      isPreferredClosestHandle(match, preferTargetHandle, requireValidHandle),
    ) ?? firstHandle
  );
}

export function getClosestHandle(args: ClosestHandleArgs) {
  const pointerHit = shouldResolveHandleBelowPointer(args.handles)
    ? resolveHandleBelowPointer(args)
    : null;
  return pointerHit ?? pickClosestHandle(collectClosestHandleMatches(args));
}

function shouldResolveHandleBelowPointer(handles: ConnectionHandle[]): boolean {
  return !handles.every((handle) => handle.isConnectableEnd !== undefined);
}

function getPointerPosition(event: MouseEvent | TouchEvent) {
  if ("touches" in event && event.touches[0]) {
    return {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
    };
  }
  return {
    x: (event as MouseEvent).clientX,
    y: (event as MouseEvent).clientY,
  };
}
