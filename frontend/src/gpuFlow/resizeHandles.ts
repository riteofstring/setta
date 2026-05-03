import { GPU_FLOW_SELECTORS } from "./gpuFlowDomClasses";
import type { GpuNodeLayout } from "./htmlSurfaces/frame";
import { resolveGpuNodeZIndex } from "./nodeZIndex";
import {
  screenToFlowPosition,
  type GpuPoint,
  type GpuRect,
  type GpuViewportInput,
} from "./viewportMath";

export const GPU_NODE_RESIZE_DIRECTIONS = [
  "right",
  "bottom",
  "bottomRight",
] as const;

export type GpuNodeResizeDirection =
  (typeof GPU_NODE_RESIZE_DIRECTIONS)[number];

export type GpuNodeResizeTarget = {
  readonly direction: GpuNodeResizeDirection;
  readonly nodeId: string;
  readonly targetElement?: HTMLElement | undefined;
};

type GpuNodeResizeHandleRect = {
  readonly direction: GpuNodeResizeDirection;
  readonly nodeId: string;
  readonly rect: GpuRect;
};

export const GPU_NODE_RESIZE_DIRECTION_ATTRIBUTE = "data-resize-direction";

export const GPU_NODE_RESIZE_HANDLE_SELECTOR = `[${GPU_NODE_RESIZE_DIRECTION_ATTRIBUTE}], .section-resize-handle`;

const GPU_NODE_RESIZE_HANDLE_HIT_SIZE_PX = 16;
const GPU_NODE_RESIZE_HANDLE_EDGE_OVERLAP_PX =
  GPU_NODE_RESIZE_HANDLE_HIT_SIZE_PX / 2;

const GPU_NODE_RESIZE_HIT_PRIORITY = [
  "bottomRight",
  "bottom",
  "right",
] as const satisfies readonly GpuNodeResizeDirection[];

const RESIZE_DIRECTION_BY_ATTRIBUTE_VALUE = new Map<
  string,
  GpuNodeResizeDirection
>([
  ["right", "right"],
  ["bottom", "bottom"],
  ["bottomRight", "bottomRight"],
  ["bottom-right", "bottomRight"],
  ["bottomright", "bottomRight"],
]);

const RESIZE_CURSOR_BY_DIRECTION = {
  right: "col-resize",
  bottom: "row-resize",
  bottomRight: "nwse-resize",
} as const satisfies Record<GpuNodeResizeDirection, string>;

export function resolveGpuNodeResizeDirection(
  target: EventTarget | Node | null,
): GpuNodeResizeDirection | null {
  const element = toElement(target);
  const handleElement = element?.closest<HTMLElement>(
    GPU_NODE_RESIZE_HANDLE_SELECTOR,
  );
  if (!handleElement) {
    return null;
  }
  return normalizeGpuNodeResizeDirection(
    handleElement.getAttribute(GPU_NODE_RESIZE_DIRECTION_ATTRIBUTE),
  );
}

export function resolveGpuNodeResizeTargetFromEventTarget(
  target: EventTarget | Node | null,
): GpuNodeResizeTarget | null {
  const element = toElement(target);
  const handleElement = element?.closest<HTMLElement>(
    GPU_NODE_RESIZE_HANDLE_SELECTOR,
  );
  if (!handleElement) {
    return null;
  }
  const direction = resolveGpuNodeResizeDirection(handleElement);
  if (!direction) {
    return null;
  }
  const nodeElement = handleElement.closest<HTMLElement>(
    GPU_FLOW_SELECTORS.node,
  );
  const nodeId = nodeElement?.dataset.id;
  if (!nodeId) {
    return null;
  }
  return {
    direction,
    nodeId,
    targetElement: handleElement,
  };
}

export function resolveGpuNodeResizeTargetAtFlowPoint({
  nodes,
  point,
}: {
  readonly nodes: readonly GpuNodeLayout[];
  readonly point: GpuPoint;
}): GpuNodeResizeTarget | null {
  const hit = resolveGpuNodeResizeHandleAtFlowPoint({ nodes, point });
  return hit ? { direction: hit.direction, nodeId: hit.nodeId } : null;
}

export function resolveGpuNodeResizeTargetAtClientPoint({
  clientX,
  clientY,
  nodes,
  surfaceElement,
  viewport,
}: {
  readonly clientX: number;
  readonly clientY: number;
  readonly nodes: readonly GpuNodeLayout[];
  readonly surfaceElement: HTMLElement;
  readonly viewport: GpuViewportInput;
}): GpuNodeResizeTarget | null {
  const surfaceRect = surfaceElement.getBoundingClientRect();
  return resolveGpuNodeResizeTargetAtFlowPoint({
    nodes,
    point: screenToFlowPosition(
      {
        x: clientX - surfaceRect.left,
        y: clientY - surfaceRect.top,
      },
      viewport,
    ),
  });
}

export function getGpuNodeResizeCursor(
  direction: GpuNodeResizeDirection,
): string {
  return RESIZE_CURSOR_BY_DIRECTION[direction];
}

export function getGpuNodeResizeHandleRects(
  node: GpuNodeLayout,
): readonly GpuNodeResizeHandleRect[] {
  if (!isMeasuredGpuNodeResizeLayout(node)) {
    return [];
  }
  const directions = new Set(getGpuNodeResizeDirections(node));
  if (directions.size === 0) {
    return [];
  }
  const rects: GpuNodeResizeHandleRect[] = [];
  if (directions.has("right")) {
    rects.push({
      direction: "right",
      nodeId: node.nodeId,
      rect: {
        height: node.height,
        width: GPU_NODE_RESIZE_HANDLE_HIT_SIZE_PX,
        x: node.x + node.width - GPU_NODE_RESIZE_HANDLE_EDGE_OVERLAP_PX,
        y: node.y,
      },
    });
  }
  if (directions.has("bottom")) {
    rects.push({
      direction: "bottom",
      nodeId: node.nodeId,
      rect: {
        height: GPU_NODE_RESIZE_HANDLE_HIT_SIZE_PX,
        width: node.width,
        x: node.x,
        y: node.y + node.height - GPU_NODE_RESIZE_HANDLE_EDGE_OVERLAP_PX,
      },
    });
  }
  if (directions.has("bottomRight")) {
    rects.push({
      direction: "bottomRight",
      nodeId: node.nodeId,
      rect: {
        height: GPU_NODE_RESIZE_HANDLE_HIT_SIZE_PX,
        width: GPU_NODE_RESIZE_HANDLE_HIT_SIZE_PX,
        x: node.x + node.width - GPU_NODE_RESIZE_HANDLE_EDGE_OVERLAP_PX,
        y: node.y + node.height - GPU_NODE_RESIZE_HANDLE_EDGE_OVERLAP_PX,
      },
    });
  }
  return rects;
}

function isGpuNodeResizeDirection(
  value: string,
): value is GpuNodeResizeDirection {
  return RESIZE_DIRECTION_BY_ATTRIBUTE_VALUE.get(value) === value;
}

function normalizeGpuNodeResizeDirection(
  value: string | null,
): GpuNodeResizeDirection | null {
  if (!value) {
    return null;
  }
  return RESIZE_DIRECTION_BY_ATTRIBUTE_VALUE.get(value) ?? null;
}

function resolveGpuNodeResizeHandleAtFlowPoint({
  nodes,
  point,
}: {
  readonly nodes: readonly GpuNodeLayout[];
  readonly point: GpuPoint;
}): GpuNodeResizeHandleRect | null {
  const candidates = nodes
    .map((node, sourceIndex) => ({ node, sourceIndex }))
    .sort((left, right) => {
      const zIndexDiff =
        resolveGpuNodeZIndex(right.node) - resolveGpuNodeZIndex(left.node);
      return zIndexDiff !== 0
        ? zIndexDiff
        : right.sourceIndex - left.sourceIndex;
    });
  for (const candidate of candidates) {
    const handle = getGpuNodeResizeHandleRects(candidate.node)
      .filter((rect) => gpuRectContainsPoint(rect.rect, point))
      .sort(
        (left, right) =>
          GPU_NODE_RESIZE_HIT_PRIORITY.indexOf(left.direction) -
          GPU_NODE_RESIZE_HIT_PRIORITY.indexOf(right.direction),
      )[0];
    if (handle) {
      return handle;
    }
  }
  return null;
}

function getGpuNodeResizeDirections(
  node: GpuNodeLayout,
): readonly GpuNodeResizeDirection[] {
  const policy = (
    node as GpuNodeLayout & {
      readonly resizePolicy?:
        | {
            readonly directions?: readonly GpuNodeResizeDirection[] | undefined;
            readonly locked?: boolean | undefined;
          }
        | undefined;
    }
  ).resizePolicy;
  if (policy?.locked) {
    return [];
  }
  return (policy?.directions ?? GPU_NODE_RESIZE_DIRECTIONS).filter(
    isGpuNodeResizeDirection,
  );
}

function isMeasuredGpuNodeResizeLayout(
  node: GpuNodeLayout,
): node is GpuNodeLayout & { readonly height: number; readonly width: number } {
  return (
    typeof node.height === "number" &&
    typeof node.width === "number" &&
    node.height > 0 &&
    node.width > 0
  );
}

function gpuRectContainsPoint(rect: GpuRect, point: GpuPoint): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

function toElement(target: EventTarget | Node | null): Element | null {
  if (target instanceof Element) {
    return target;
  }
  if (target instanceof Node) {
    return target.parentElement;
  }
  return null;
}
