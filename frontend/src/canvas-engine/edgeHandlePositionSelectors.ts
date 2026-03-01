import type { CanvasEngineEdgeHandlePosition } from "canvas-engine/sceneAdapter";
import type { ProjectConfig } from "utils/generatedTypes";

export function buildDataEdgeHandleKey(
  sectionId: string,
  portId: string,
  type: "source" | "target",
): string {
  return `${sectionId}:${portId}:${type}`;
}

export function buildConnectedDataEdgeHandleKeys(
  edges: ProjectConfig["edges"],
): string[] {
  const uniqueKeys: string[] = [];
  const seenKeys = new Set<string>();

  for (const edge of edges) {
    const sourceKey = buildDataEdgeHandleKey(
      edge.sourceSectionId,
      edge.sourcePortId,
      "source",
    );
    if (!seenKeys.has(sourceKey)) {
      seenKeys.add(sourceKey);
      uniqueKeys.push(sourceKey);
    }

    const targetKey = buildDataEdgeHandleKey(
      edge.targetSectionId,
      edge.targetPortId,
      "target",
    );
    if (!seenKeys.has(targetKey)) {
      seenKeys.add(targetKey);
      uniqueKeys.push(targetKey);
    }
  }

  return uniqueKeys;
}

export function pickEdgeHandlePositionsByKeys(
  positions: Record<string, CanvasEngineEdgeHandlePosition>,
  keys: string[],
): Record<string, CanvasEngineEdgeHandlePosition> {
  if (keys.length === 0) {
    return {};
  }

  const picked: Record<string, CanvasEngineEdgeHandlePosition> = {};
  for (const key of keys) {
    const position = positions[key];
    if (!position) {
      continue;
    }
    picked[key] = position;
  }
  return picked;
}

export function areEdgeHandlePositionMapsEqual(
  left: Record<string, CanvasEngineEdgeHandlePosition>,
  right: Record<string, CanvasEngineEdgeHandlePosition>,
): boolean {
  if (left === right) {
    return true;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}
