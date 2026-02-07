import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import type { HandlePosition, HandleType } from "forks/xyflow/core/types";
import type { EdgeHandleRecord } from "state/definitions";
import { useEdgeHandleRegistry } from "state/definitions";

export function makeEdgeHandleKey(
  sectionId: string,
  portId: string,
  type: HandleType,
) {
  return `${sectionId}:${portId}:${type}`;
}

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
}: {
  sectionId: string;
  portIds: string[];
  type: HandleType;
  side: HandlePosition;
  element: HTMLElement;
}) {
  if (portIds.length === 0) {
    return;
  }
  const center = getHandleCenter(element);
  const { x, y } = screenToFlowPosition(center, true);
  useEdgeHandleRegistry.setState((state) => {
    for (const portId of portIds) {
      const key = makeEdgeHandleKey(sectionId, portId, type);
      state.handles[key] = {
        sectionId,
        portId,
        type,
        side,
        element,
      };
      const prev = state.positions[key];
      if (!prev || prev.x !== x || prev.y !== y || prev.side !== side) {
        state.positions[key] = {
          sectionId,
          portId,
          type,
          side,
          x,
          y,
        };
      }
    }
  });
}

function setHandlePosition(key: string, record: EdgeHandleRecord) {
  if (!record.element) {
    return false;
  }
  const center = getHandleCenter(record.element);
  const { x, y } = screenToFlowPosition(center, true);
  let updated = false;
  useEdgeHandleRegistry.setState((state) => {
    const prev = state.positions[key];
    if (!prev || prev.x !== x || prev.y !== y || prev.side !== record.side) {
      state.positions[key] = {
        sectionId: record.sectionId,
        portId: record.portId,
        type: record.type,
        side: record.side,
        x,
        y,
      };
      updated = true;
    }
  });
  return updated;
}

export function registerEdgeHandle(record: EdgeHandleRecord) {
  const key = makeEdgeHandleKey(record.sectionId, record.portId, record.type);
  useEdgeHandleRegistry.setState((state) => {
    state.handles[key] = record;
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
  useEdgeHandleRegistry.setState((state) => {
    if (state.handles[key]) {
      delete state.handles[key];
      delete state.positions[key];
    }
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
  const sectionIdSet = new Set(sectionIds);
  const { handles } = useEdgeHandleRegistry.getState();
  const flowPositionsByElement = new Map<HTMLElement, { x: number; y: number }>();
  const updates: Array<{
    key: string;
    record: EdgeHandleRecord;
    x: number;
    y: number;
  }> = [];

  for (const [key, record] of Object.entries(handles)) {
    if (!sectionIdSet.has(record.sectionId)) {
      continue;
    }
    const element = record.element;
    if (!element) {
      continue;
    }
    let flowPosition = flowPositionsByElement.get(element);
    if (!flowPosition) {
      const center = getHandleCenter(element);
      flowPosition = screenToFlowPosition(center, true);
      flowPositionsByElement.set(element, flowPosition);
    }
    updates.push({
      key,
      record,
      x: flowPosition.x,
      y: flowPosition.y,
    });
  }

  if (updates.length === 0) {
    return;
  }

  useEdgeHandleRegistry.setState((state) => {
    for (const entry of updates) {
      const prev = state.positions[entry.key];
      if (
        !prev ||
        prev.x !== entry.x ||
        prev.y !== entry.y ||
        prev.side !== entry.record.side
      ) {
        state.positions[entry.key] = {
          sectionId: entry.record.sectionId,
          portId: entry.record.portId,
          type: entry.record.type,
          side: entry.record.side,
          x: entry.x,
          y: entry.y,
        };
      }
    }
  });
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
