import type { NodeTextureManager, NodeTextureRecord } from "./nodeTextures";
import {
  flowToScreenPosition,
  getVisibleFlowRect,
  normalizeGpuViewport,
  rectsIntersect,
  type GpuRect,
  type GpuViewportInput,
} from "./viewportMath";

export type GpuNodeLayout = {
  readonly height: number | null;
  readonly nodeId: string;
  readonly tempZIndex?: number | undefined;
  readonly width: number | null;
  readonly x: number;
  readonly y: number;
  readonly zIndex?: number | undefined;
};

export type GpuVisibleNodeQuad = {
  readonly height: number;
  readonly nodeId: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

export type GpuTexturedNodeQuad = GpuVisibleNodeQuad & {
  readonly texture: NodeTextureRecord;
};

export type CollectVisibleGpuNodeQuadsInput = {
  readonly canvasHeight: number;
  readonly canvasWidth: number;
  readonly forceVisibleNodeIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly marginCssPx?: number | undefined;
  readonly nodes: readonly GpuNodeLayout[];
  readonly viewport: GpuViewportInput;
};

export type BuildTexturedGpuNodeQuadsResult = {
  readonly missingTextureNodeIds: readonly string[];
  readonly texturedQuads: readonly GpuTexturedNodeQuad[];
};

export type SyncGpuNodeDomTransformsInput = {
  readonly elementByNodeId:
    | ReadonlyMap<string, HTMLElement>
    | ((nodeId: string) => HTMLElement | null | undefined);
  readonly nodes: readonly GpuNodeLayout[];
  readonly offscreenX?: number | undefined;
  readonly offscreenY?: number | undefined;
  readonly visibleNodeIds: ReadonlySet<string>;
  readonly viewport: GpuViewportInput;
};

const DEFAULT_OFFSCREEN_POSITION = -100_000;

export function collectVisibleGpuNodeQuads({
  canvasHeight,
  canvasWidth,
  forceVisibleNodeIds,
  marginCssPx = 128,
  nodes,
  viewport,
}: CollectVisibleGpuNodeQuadsInput): GpuVisibleNodeQuad[] {
  const forcedIds = normalizeNodeIdSet(forceVisibleNodeIds);
  const visibleRect = getVisibleFlowRect({
    canvasHeight,
    canvasWidth,
    marginCssPx,
    viewport,
  });
  const visible: Array<GpuVisibleNodeQuad & { readonly sourceIndex: number }> =
    [];

  nodes.forEach((node, sourceIndex) => {
    const quad = toNodeQuad(node);
    if (!quad) {
      return;
    }
    if (
      forcedIds.has(quad.nodeId) ||
      rectsIntersect(toRect(quad), visibleRect)
    ) {
      visible.push({ ...quad, sourceIndex });
    }
  });

  return visible
    .sort(
      (left, right) =>
        left.zIndex - right.zIndex || left.sourceIndex - right.sourceIndex,
    )
    .map((quad) => ({
      height: quad.height,
      nodeId: quad.nodeId,
      width: quad.width,
      x: quad.x,
      y: quad.y,
      zIndex: quad.zIndex,
    }));
}

export function buildTexturedGpuNodeQuads(
  quads: readonly GpuVisibleNodeQuad[],
  textureSource:
    | Pick<NodeTextureManager, "getNodeTexture">
    | ((nodeId: string) => NodeTextureRecord | undefined),
): BuildTexturedGpuNodeQuadsResult {
  const getTexture =
    typeof textureSource === "function"
      ? textureSource
      : textureSource.getNodeTexture.bind(textureSource);
  const texturedQuads: GpuTexturedNodeQuad[] = [];
  const missingTextureNodeIds: string[] = [];

  for (const quad of quads) {
    const texture = getTexture(quad.nodeId);
    if (!texture) {
      missingTextureNodeIds.push(quad.nodeId);
      continue;
    }
    texturedQuads.push({ ...quad, texture });
  }

  return { missingTextureNodeIds, texturedQuads };
}

export function syncGpuNodeDomTransforms({
  elementByNodeId,
  nodes,
  offscreenX = DEFAULT_OFFSCREEN_POSITION,
  offscreenY = DEFAULT_OFFSCREEN_POSITION,
  visibleNodeIds,
  viewport,
}: SyncGpuNodeDomTransformsInput) {
  const normalizedViewport = normalizeGpuViewport(viewport);
  for (const node of nodes) {
    const element = resolveElement(elementByNodeId, node.nodeId);
    if (!element) {
      continue;
    }
    const visible = visibleNodeIds.has(node.nodeId);
    if (visible) {
      const screenPosition = flowToScreenPosition(
        { x: node.x, y: node.y },
        normalizedViewport,
      );
      applyVisibleNodeDomTransform(element, {
        screenX: screenPosition.x,
        screenY: screenPosition.y,
        zoom: normalizedViewport.zoom,
      });
      continue;
    }

    applyCulledNodeDomTransform(element, offscreenX, offscreenY);
  }
}

export function applyVisibleNodeDomTransform(
  element: HTMLElement,
  {
    screenX,
    screenY,
    zoom,
  }: {
    readonly screenX: number;
    readonly screenY: number;
    readonly zoom: number;
  },
) {
  element.style.position = "absolute";
  element.style.left = "0px";
  element.style.top = "0px";
  element.style.transformOrigin = "0 0";
  element.style.transform = `translate(${screenX}px, ${screenY}px) scale(${zoom})`;
  element.style.pointerEvents = "all";
}

export function applyCulledNodeDomTransform(
  element: HTMLElement,
  offscreenX = DEFAULT_OFFSCREEN_POSITION,
  offscreenY = DEFAULT_OFFSCREEN_POSITION,
) {
  element.style.position = "absolute";
  element.style.left = "0px";
  element.style.top = "0px";
  element.style.transformOrigin = "0 0";
  element.style.transform = `translate(${offscreenX}px, ${offscreenY}px) scale(1)`;
  element.style.pointerEvents = "none";
}

function normalizeNodeIdSet(
  nodeIds: ReadonlySet<string> | readonly string[] | undefined,
): ReadonlySet<string> {
  if (!nodeIds) {
    return new Set();
  }
  if (nodeIds instanceof Set) {
    return nodeIds;
  }
  return new Set(nodeIds);
}

function resolveElement(
  elementByNodeId:
    | ReadonlyMap<string, HTMLElement>
    | ((nodeId: string) => HTMLElement | null | undefined),
  nodeId: string,
): HTMLElement | null | undefined {
  return typeof elementByNodeId === "function"
    ? elementByNodeId(nodeId)
    : elementByNodeId.get(nodeId);
}

function toNodeQuad(node: GpuNodeLayout): GpuVisibleNodeQuad | null {
  if (
    node.width === null ||
    node.height === null ||
    node.width <= 0 ||
    node.height <= 0
  ) {
    return null;
  }

  return {
    height: node.height,
    nodeId: node.nodeId,
    width: node.width,
    x: node.x,
    y: node.y,
    zIndex: node.tempZIndex ?? node.zIndex ?? 0,
  };
}

function toRect(quad: GpuVisibleNodeQuad): GpuRect {
  return {
    height: quad.height,
    width: quad.width,
    x: quad.x,
    y: quad.y,
  };
}
