import type { HandlePosition, HandleType } from "forks/xyflow/core/types";
import {
  type EdgeHandleRecord,
  useEdgeHandleRegistry,
} from "state/stores/layoutInteractionStores";

import { makeEdgeHandleKey } from "./edgeHandleKeys";
import {
  syncEdgeHandlePositions,
  updateEdgeHandlePosition,
} from "./edgeHandlePositionState";

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

  const entries: Array<{ key: string; record: EdgeHandleRecord }> = [];
  useEdgeHandleRegistry.setState((state) => {
    for (const portId of portIds) {
      const key = makeEdgeHandleKey(sectionId, portId, type);
      const record: EdgeHandleRecord = {
        sectionId,
        portId,
        type,
        side,
        element,
      };
      state.handles[key] = record;
      entries.push({ key, record });
    }
  });
  syncEdgeHandlePositions(entries);
}

export function registerEdgeHandle(record: EdgeHandleRecord) {
  const key = makeEdgeHandleKey(record.sectionId, record.portId, record.type);
  const nextRecord: EdgeHandleRecord = { ...record };
  useEdgeHandleRegistry.setState((state) => {
    state.handles[key] = nextRecord;
  });
  updateEdgeHandlePosition(key);
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
