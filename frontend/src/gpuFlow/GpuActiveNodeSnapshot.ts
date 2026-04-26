import type { GpuNodeLayout } from "./GpuNodeLayer";
import { resolveGpuNodeZIndex } from "./nodeZIndex";
import {
  flowToScreenPosition,
  normalizeGpuViewport,
  type GpuViewportInput,
} from "./viewportMath";

export type GpuActiveNodeSnapshot = {
  readonly frame: number;
  readonly height: number;
  readonly nodeId: string;
  readonly screenX: number;
  readonly screenY: number;
  readonly sourceElement: HTMLElement;
  readonly width: number;
  readonly zIndex: number;
  readonly zoom: number;
};

type ResolveGpuActiveNodeSnapshotInput = {
  readonly activeNodeId: string | null | undefined;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly frame: number;
  readonly nodes: readonly GpuNodeLayout[] | undefined;
  readonly viewport: GpuViewportInput;
};

export function resolveGpuActiveNodeSnapshot({
  activeNodeId,
  elementByNodeId,
  frame,
  nodes,
  viewport,
}: ResolveGpuActiveNodeSnapshotInput): GpuActiveNodeSnapshot | null {
  if (!activeNodeId || !nodes) {
    return null;
  }
  const node = nodes.find((candidate) => candidate.nodeId === activeNodeId);
  if (!isRenderableGpuActiveNode(node)) {
    return null;
  }
  const sourceElement = elementByNodeId.get(node.nodeId);
  if (!sourceElement) {
    return null;
  }

  const normalizedViewport = normalizeGpuViewport(viewport);
  const screenPosition = flowToScreenPosition(
    { x: node.x, y: node.y },
    normalizedViewport,
  );
  return {
    frame,
    height: node.height,
    nodeId: node.nodeId,
    screenX: screenPosition.x,
    screenY: screenPosition.y,
    sourceElement,
    width: node.width,
    zIndex: resolveGpuNodeZIndex(node),
    zoom: normalizedViewport.zoom,
  };
}

function isRenderableGpuActiveNode(
  node: GpuNodeLayout | undefined,
): node is GpuNodeLayout & { readonly height: number; readonly width: number } {
  return Boolean(
    node &&
      node.width !== null &&
      node.height !== null &&
      node.width > 0 &&
      node.height > 0,
  );
}
