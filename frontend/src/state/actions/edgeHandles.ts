import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import type { HandleType } from "forks/xyflow/core/types";
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
  for (const [key, record] of Object.entries(handles)) {
    if (sectionIdSet.has(record.sectionId)) {
      setHandlePosition(key, record);
    }
  }
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
