import type { HandleType } from "forks/xyflow/core/types";

export function makeEdgeHandleKey(
  sectionId: string,
  portId: string,
  type: HandleType,
) {
  return `${sectionId}:${portId}:${type}`;
}
