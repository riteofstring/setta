import type { Rect } from "forks/xyflow/core/types";
import type {
  CanvasFlowNode,
  CanvasFlowNodeDrawRecord,
} from "./canvasFlowTypes";

export function getNodeDrawDimensions(
  node: Pick<CanvasFlowNode, "width" | "height">,
  element?: HTMLElement,
): { width: number; height: number } | null {
  const width = node.width ?? element?.offsetWidth ?? 0;
  const height = node.height ?? element?.offsetHeight ?? 0;
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

export function getNodeDrawRecord(
  node: CanvasFlowNode,
  element?: HTMLElement,
): CanvasFlowNodeDrawRecord | null {
  const dimensions = getNodeDrawDimensions(node, element);
  if (!dimensions) {
    return null;
  }
  return {
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: dimensions.width,
    height: dimensions.height,
    zIndex: node.tempZIndex ?? node.zIndex,
  };
}

export function rectsOverlap(left: Rect, right: Rect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

export function nodeRecordToRect(record: CanvasFlowNodeDrawRecord): Rect {
  return {
    x: record.x,
    y: record.y,
    width: record.width,
    height: record.height,
  };
}

export function getVisibleNodeDrawRecords({
  nodes,
  nodeElements,
  visibleRect,
}: {
  nodes: CanvasFlowNode[];
  nodeElements: Map<string, HTMLElement>;
  visibleRect: Rect;
}): CanvasFlowNodeDrawRecord[] {
  const visible: CanvasFlowNodeDrawRecord[] = [];
  for (const node of nodes) {
    const record = getNodeDrawRecord(node, nodeElements.get(node.id));
    if (!record) {
      continue;
    }
    if (rectsOverlap(nodeRecordToRect(record), visibleRect)) {
      visible.push(record);
    }
  }
  visible.sort((left, right) => left.zIndex - right.zIndex);
  return visible;
}
