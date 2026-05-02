import type { HandlePosition, HandleType } from "gpuFlow/flowTypes";
import { screenToFlowPosition } from "gpuFlow/viewportActions";
import type { EdgeHandleRecord } from "state/definitions";
import { useEdgeHandleRegistry } from "state/definitions";
import { makeEdgeHandleKey } from "state/edgeHandleKeys";

type EdgeHandlePosition = NonNullable<
  ReturnType<typeof useEdgeHandleRegistry.getState>["positions"][string]
>;

type EdgeHandlePositionUpdate = {
  key: string;
  record: EdgeHandleRecord;
  x: number;
  y: number;
};

function getHandleCenter(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export function registerEdgeHandlesWithSharedElement({
  sectionId,
  portIds,
  type,
  side,
  element,
  isConnectableEnd = true,
}: {
  sectionId: string;
  portIds: string[];
  type: HandleType;
  side: HandlePosition;
  element: HTMLElement;
  isConnectableEnd?: boolean;
}) {
  if (portIds.length === 0) {
    return;
  }
  const center = getHandleCenter(element);
  const { x, y } = screenToFlowPosition(center);
  const current = useEdgeHandleRegistry.getState();
  const nextHandles = { ...current.handles };
  const nextPositions = { ...current.positions };
  for (const portId of portIds) {
    const key = makeEdgeHandleKey(sectionId, portId, type);
    nextHandles[key] = {
      sectionId,
      portId,
      type,
      side,
      element,
      isConnectableEnd,
    };
    const prev = nextPositions[key];
    if (!prev || prev.x !== x || prev.y !== y || prev.side !== side) {
      nextPositions[key] = {
        sectionId,
        portId,
        type,
        side,
        x,
        y,
      };
    }
  }
  useEdgeHandleRegistry.setState({
    handles: nextHandles,
    positions: nextPositions,
  });
}

function setHandlePosition(key: string, record: EdgeHandleRecord) {
  if (!record.element) {
    return false;
  }
  const center = getHandleCenter(record.element);
  const { x, y } = screenToFlowPosition(center);
  const current = useEdgeHandleRegistry.getState();
  const prev = current.positions[key];
  if (prev && prev.x === x && prev.y === y && prev.side === record.side) {
    return false;
  }
  useEdgeHandleRegistry.setState({
    positions: {
      ...current.positions,
      [key]: {
        sectionId: record.sectionId,
        portId: record.portId,
        type: record.type,
        side: record.side,
        x,
        y,
      },
    },
  });
  return true;
}

export function registerEdgeHandle(record: EdgeHandleRecord) {
  const key = makeEdgeHandleKey(record.sectionId, record.portId, record.type);
  useEdgeHandleRegistry.setState({
    handles: {
      ...useEdgeHandleRegistry.getState().handles,
      [key]: record,
    },
  });
  setHandlePosition(key, record);
  return key;
}

export function unregisterEdgeHandle(
  sectionId: string,
  portId: string,
  type: HandleType,
) {
  const key = makeEdgeHandleKey(sectionId, portId, type);
  const current = useEdgeHandleRegistry.getState();
  if (!current.handles[key]) {
    return;
  }
  const nextHandles = { ...current.handles };
  const nextPositions = { ...current.positions };
  delete nextHandles[key];
  delete nextPositions[key];
  useEdgeHandleRegistry.setState({
    handles: nextHandles,
    positions: nextPositions,
  });
}

export function updateEdgeHandlePosition(key: string) {
  const record = useEdgeHandleRegistry.getState().handles[key];
  if (!record) {
    return;
  }
  setHandlePosition(key, record);
}

export function recomputeEdgeHandlePositions() {
  const { handles } = useEdgeHandleRegistry.getState();
  for (const [key, record] of Object.entries(handles)) {
    setHandlePosition(key, record);
  }
}

function updateEdgeHandlePositionsForSections(sectionIds: string[]) {
  if (sectionIds.length === 0) {
    return;
  }
  const updates = collectEdgeHandlePositionUpdates(sectionIds);
  applyEdgeHandlePositionUpdates(updates);
}

function collectEdgeHandlePositionUpdates(
  sectionIds: string[],
): EdgeHandlePositionUpdate[] {
  const sectionIdSet = new Set(sectionIds);
  const handles = useEdgeHandleRegistry.getState().handles;
  const flowPositionsByElement = new Map<
    HTMLElement,
    { x: number; y: number }
  >();
  const updates: EdgeHandlePositionUpdate[] = [];

  for (const [key, record] of Object.entries(handles)) {
    if (!sectionIdSet.has(record.sectionId)) {
      continue;
    }
    const element = record.element;
    if (!element) {
      continue;
    }
    const flowPosition = getCachedHandleFlowPosition(
      element,
      flowPositionsByElement,
    );
    updates.push({
      key,
      record,
      x: flowPosition.x,
      y: flowPosition.y,
    });
  }

  return updates;
}

function getCachedHandleFlowPosition(
  element: HTMLElement,
  flowPositionsByElement: Map<HTMLElement, { x: number; y: number }>,
) {
  const cached = flowPositionsByElement.get(element);
  if (cached) {
    return cached;
  }
  const center = getHandleCenter(element);
  const flowPosition = screenToFlowPosition(center);
  flowPositionsByElement.set(element, flowPosition);
  return flowPosition;
}

function applyEdgeHandlePositionUpdates(updates: EdgeHandlePositionUpdate[]) {
  if (updates.length === 0) {
    return;
  }

  const current = useEdgeHandleRegistry.getState();
  let nextPositions: Record<string, EdgeHandlePosition> | null = null;
  for (const entry of updates) {
    const prev = current.positions[entry.key];
    if (!hasEdgeHandlePositionChanged(prev, entry)) {
      continue;
    }
    nextPositions ??= { ...current.positions };
    nextPositions[entry.key] = {
      sectionId: entry.record.sectionId,
      portId: entry.record.portId,
      type: entry.record.type,
      side: entry.record.side,
      x: entry.x,
      y: entry.y,
    };
  }
  if (nextPositions) {
    useEdgeHandleRegistry.setState({
      positions: nextPositions,
    });
  }
}

function hasEdgeHandlePositionChanged(
  prev: EdgeHandlePosition | undefined,
  entry: EdgeHandlePositionUpdate,
) {
  return (
    !prev ||
    prev.x !== entry.x ||
    prev.y !== entry.y ||
    prev.side !== entry.record.side
  );
}

let pendingHandleUpdateFrame: number | null = null;
const pendingHandleSectionIds = new Set<string>();

export function scheduleEdgeHandlePositionUpdate(sectionIds: string[]) {
  if (sectionIds.length === 0) {
    return;
  }
  for (const sectionId of sectionIds) {
    pendingHandleSectionIds.add(sectionId);
  }
  if (pendingHandleUpdateFrame !== null) {
    return;
  }
  pendingHandleUpdateFrame = requestAnimationFrame(() => {
    pendingHandleUpdateFrame = null;
    if (pendingHandleSectionIds.size === 0) {
      return;
    }
    const nextIds = Array.from(pendingHandleSectionIds);
    pendingHandleSectionIds.clear();
    updateEdgeHandlePositionsForSections(nextIds);
  });
}
