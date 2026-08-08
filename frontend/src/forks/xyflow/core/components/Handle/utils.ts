import type {
  Connection,
  ConnectionMode,
  HandleType,
} from "forks/xyflow/core/types";

export type ConnectionHandle = {
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

export function getHandleLookup(
  handles: ConnectionHandle[],
  currentHandleKey: string,
) {
  return handles.filter(
    (handle) =>
      `${handle.sectionId}-${handle.portId}-${handle.type}` !==
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
    "react-flow__handle-valid",
    "react-flow__handle-connecting",
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

export function isValidHandle(
  handle: Pick<ConnectionHandle, "sectionId" | "portId" | "type">,
  connectionMode: ConnectionMode,
  fromSectionId: string,
  fromHandleId: string | null,
  fromType: HandleType,
  isValidConnection: ValidConnectionFunc,
  doc: Document | ShadowRoot,
) {
  const isTarget = fromType === "target";
  const handleToCheck = doc.querySelector(
    `.react-flow__handle[data-id="${handle?.sectionId}-${handle?.portId}-${handle?.type}"]`,
  );

  const result: Result = {
    ...defaultResult(),
    handleDomNode: handleToCheck,
  };

  if (!handleToCheck) {
    return result;
  }

  const handleType = getHandleType(undefined, handleToCheck);
  const handleSectionId = handleToCheck.getAttribute("data-nodeid");
  const handleId = handleToCheck.getAttribute("data-handleid");
  const connectable = handleToCheck.classList.contains("connectable");
  const connectableEnd = handleToCheck.classList.contains("connectableend");

  const connection: Connection = {
    source: isTarget ? handleSectionId : fromSectionId,
    sourceHandle: isTarget ? handleId : fromHandleId,
    target: isTarget ? fromSectionId : handleSectionId,
    targetHandle: isTarget ? fromHandleId : handleId,
  };

  result.connection = connection;

  const isConnectable = connectable && connectableEnd;
  const isValid =
    isConnectable &&
    (connectionMode === "strict"
      ? (isTarget && handleType === "source") ||
        (!isTarget && handleType === "target")
      : handleSectionId !== fromSectionId || handleId !== fromHandleId);

  if (isValid) {
    result.endHandle = {
      sectionId: handleSectionId as string,
      handleId,
      type: handleType as HandleType,
    };
    result.isValid = isValidConnection(connection);
  }

  return result;
}

export function getClosestHandle(
  event: MouseEvent | TouchEvent,
  doc: Document | ShadowRoot,
  pos: { x: number; y: number },
  connectionRadius: number,
  handles: ConnectionHandle[],
  allowHandle:
    | ((handle: Pick<ConnectionHandle, "portId" | "type">) => boolean)
    | null,
  validator: (
    handle: Pick<ConnectionHandle, "sectionId" | "portId" | "type">,
  ) => Result,
) {
  const isHandleAllowed = allowHandle ?? (() => true);
  const eventPos = getPointerPosition(event);
  const handleBelow = doc
    .elementsFromPoint(eventPos.x, eventPos.y)
    .find((el) => el.classList.contains("react-flow__handle"));

  if (handleBelow) {
    const handleSectionId = handleBelow.getAttribute("data-nodeid");
    if (handleSectionId) {
      const handleType = getHandleType(undefined, handleBelow);
      const handleId = handleBelow.getAttribute("data-handleid");
      if (
        isHandleAllowed({
          portId: handleId,
          type: handleType,
        })
      ) {
        const validHandleResult = validator({
          sectionId: handleSectionId,
          portId: handleId,
          type: handleType,
        });
        if (validHandleResult) {
          const handle = handles.find(
            (entry) =>
              entry.sectionId === handleSectionId &&
              entry.type === handleType &&
              entry.portId === handleId,
          );
          return {
            handle: {
              sectionId: handleSectionId,
              portId: handleId,
              type: handleType,
              x: handle?.x ?? pos.x,
              y: handle?.y ?? pos.y,
            },
            validHandleResult,
          };
        }
      }
    }
  }

  let closestHandles: {
    handle: ConnectionHandle;
    validHandleResult: Result;
  }[] = [];
  let minDistance = Infinity;

  handles.forEach((handle) => {
    if (
      !isHandleAllowed({
        portId: handle.portId,
        type: handle.type,
      })
    ) {
      return;
    }
    const distance = Math.sqrt(
      (handle.x - pos.x) ** 2 + (handle.y - pos.y) ** 2,
    );

    if (distance <= connectionRadius) {
      const validHandleResult = validator(handle);

      if (distance <= minDistance) {
        if (distance < minDistance) {
          closestHandles = [{ handle, validHandleResult }];
        } else if (distance === minDistance) {
          closestHandles.push({ handle, validHandleResult });
        }
        minDistance = distance;
      }
    }
  });

  if (!closestHandles.length) {
    return { handle: null, validHandleResult: defaultResult() };
  }

  if (closestHandles.length === 1) {
    return closestHandles[0];
  }

  const hasValidHandle = closestHandles.some(
    ({ validHandleResult }) => validHandleResult.isValid,
  );
  const hasTargetHandle = closestHandles.some(
    ({ handle }) => handle.type === "target",
  );

  return (
    closestHandles.find(({ handle, validHandleResult }) =>
      hasTargetHandle
        ? handle.type === "target"
        : true && (hasValidHandle ? validHandleResult.isValid : true),
    ) || closestHandles[0]
  );
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
