import { type FloatingSnapResizeHandle } from "components/ChatWindowing/projectChatSnapLayout";
import { type ChatWindowBounds } from "utils/generatedTypes";
import { type StandaloneWindowSpaceWindow } from "./StandaloneWindowSpaceHydration";

export type ActiveStandaloneSnapResize = {
  pointerId: number;
  axis: FloatingSnapResizeHandle["axis"];
  startPointerPosition: number;
  startCoordinate: number;
  minCoordinate: number;
  maxCoordinate: number;
  leadingInstanceIds: string[];
  trailingInstanceIds: string[];
  startBoundsByInstanceId: Record<string, ChatWindowBounds>;
};

type StandaloneSnapResizeLimits = {
  minCoordinate: number;
  maxCoordinate: number;
};

const STANDALONE_WINDOW_SPACE_MIN_WIDTH_PX = 220;
const STANDALONE_WINDOW_SPACE_MIN_HEIGHT_PX = 180;

function collectStandaloneSnapResizeStartBounds(
  windowsById: Record<string, StandaloneWindowSpaceWindow>,
  handle: FloatingSnapResizeHandle,
): Record<string, ChatWindowBounds> | null {
  const startBoundsByInstanceId: Record<string, ChatWindowBounds> = {};
  const involvedInstanceIds = [
    ...handle.leadingInstanceIds,
    ...handle.trailingInstanceIds,
  ];
  for (const instanceId of involvedInstanceIds) {
    const bounds = windowsById[instanceId]?.bounds;
    if (!bounds) {
      return null;
    }
    startBoundsByInstanceId[instanceId] = { ...bounds };
  }
  return startBoundsByInstanceId;
}

function resolveVerticalStandaloneSnapResizeLimits(
  startBoundsByInstanceId: Record<string, ChatWindowBounds>,
  leadingInstanceIds: string[],
  trailingInstanceIds: string[],
): StandaloneSnapResizeLimits | null {
  let minCoordinate = -Infinity;
  let maxCoordinate = Infinity;
  for (const instanceId of leadingInstanceIds) {
    const bounds = startBoundsByInstanceId[instanceId];
    if (!bounds) {
      return null;
    }
    minCoordinate = Math.max(
      minCoordinate,
      bounds.x + STANDALONE_WINDOW_SPACE_MIN_WIDTH_PX,
    );
  }
  for (const instanceId of trailingInstanceIds) {
    const bounds = startBoundsByInstanceId[instanceId];
    if (!bounds) {
      return null;
    }
    maxCoordinate = Math.min(
      maxCoordinate,
      bounds.x + bounds.width - STANDALONE_WINDOW_SPACE_MIN_WIDTH_PX,
    );
  }
  return { minCoordinate, maxCoordinate };
}

function resolveHorizontalStandaloneSnapResizeLimits(
  startBoundsByInstanceId: Record<string, ChatWindowBounds>,
  leadingInstanceIds: string[],
  trailingInstanceIds: string[],
): StandaloneSnapResizeLimits | null {
  let minCoordinate = -Infinity;
  let maxCoordinate = Infinity;
  for (const instanceId of leadingInstanceIds) {
    const bounds = startBoundsByInstanceId[instanceId];
    if (!bounds) {
      return null;
    }
    minCoordinate = Math.max(
      minCoordinate,
      bounds.y + STANDALONE_WINDOW_SPACE_MIN_HEIGHT_PX,
    );
  }
  for (const instanceId of trailingInstanceIds) {
    const bounds = startBoundsByInstanceId[instanceId];
    if (!bounds) {
      return null;
    }
    maxCoordinate = Math.min(
      maxCoordinate,
      bounds.y + bounds.height - STANDALONE_WINDOW_SPACE_MIN_HEIGHT_PX,
    );
  }
  return { minCoordinate, maxCoordinate };
}

function resolveStandaloneSnapResizeLimits(
  handle: FloatingSnapResizeHandle,
  startBoundsByInstanceId: Record<string, ChatWindowBounds>,
): StandaloneSnapResizeLimits | null {
  if (handle.axis === "vertical") {
    return resolveVerticalStandaloneSnapResizeLimits(
      startBoundsByInstanceId,
      handle.leadingInstanceIds,
      handle.trailingInstanceIds,
    );
  }
  return resolveHorizontalStandaloneSnapResizeLimits(
    startBoundsByInstanceId,
    handle.leadingInstanceIds,
    handle.trailingInstanceIds,
  );
}

export function createActiveStandaloneSnapResize({
  windowsById,
  handle,
  pointerId,
  pointerX,
  pointerY,
}: {
  windowsById: Record<string, StandaloneWindowSpaceWindow>;
  handle: FloatingSnapResizeHandle;
  pointerId: number;
  pointerX: number;
  pointerY: number;
}): ActiveStandaloneSnapResize | null {
  const startBoundsByInstanceId = collectStandaloneSnapResizeStartBounds(
    windowsById,
    handle,
  );
  if (!startBoundsByInstanceId) {
    return null;
  }
  const limits = resolveStandaloneSnapResizeLimits(
    handle,
    startBoundsByInstanceId,
  );
  if (!limits) {
    return null;
  }
  return {
    pointerId,
    axis: handle.axis,
    startPointerPosition: handle.axis === "vertical" ? pointerX : pointerY,
    startCoordinate: handle.coordinate,
    ...limits,
    leadingInstanceIds: handle.leadingInstanceIds,
    trailingInstanceIds: handle.trailingInstanceIds,
    startBoundsByInstanceId,
  };
}
