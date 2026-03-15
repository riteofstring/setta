import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import {
  type EdgeHandleRecord,
  useEdgeHandleRegistry,
} from "state/stores/layoutInteractionStores";

type EdgeHandleRegistryEntry = {
  key: string;
  record: EdgeHandleRecord;
};

type EdgeHandlePositionUpdate = EdgeHandleRegistryEntry & {
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

function collectEdgeHandlePositionUpdates(
  entries: Array<EdgeHandleRegistryEntry>,
): Array<EdgeHandlePositionUpdate> {
  const flowPositionsByElement = new Map<
    HTMLElement,
    { x: number; y: number }
  >();
  const updates: Array<EdgeHandlePositionUpdate> = [];

  for (const entry of entries) {
    const element = entry.record.element;
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
      ...entry,
      x: flowPosition.x,
      y: flowPosition.y,
    });
  }

  return updates;
}

function applyEdgeHandlePositionUpdates(
  updates: Array<EdgeHandlePositionUpdate>,
): void {
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

export function syncEdgeHandlePositions(
  entries: Array<EdgeHandleRegistryEntry>,
): void {
  applyEdgeHandlePositionUpdates(collectEdgeHandlePositionUpdates(entries));
}

export function updateEdgeHandlePosition(key: string): void {
  const record = useEdgeHandleRegistry.getState().handles[key];
  if (!record) {
    return;
  }
  syncEdgeHandlePositions([{ key, record }]);
}

export function recomputeEdgeHandlePositions(): void {
  const entries = Object.entries(useEdgeHandleRegistry.getState().handles).map(
    ([key, record]) => ({ key, record }),
  );
  syncEdgeHandlePositions(entries);
}

export function updateEdgeHandlePositionsForSections(
  sectionIds: string[],
): void {
  if (sectionIds.length === 0) {
    return;
  }
  const sectionIdSet = new Set(sectionIds);
  const entries = Object.entries(useEdgeHandleRegistry.getState().handles)
    .filter(([, record]) => sectionIdSet.has(record.sectionId))
    .map(([key, record]) => ({ key, record }));
  syncEdgeHandlePositions(entries);
}
