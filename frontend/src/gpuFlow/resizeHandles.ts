import { GPU_FLOW_SELECTORS } from "./gpuFlowDomClasses";

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

export const GPU_NODE_RESIZE_DIRECTION_ATTRIBUTE = "data-resize-direction";

export const GPU_NODE_RESIZE_HANDLE_SELECTOR =
  `[${GPU_NODE_RESIZE_DIRECTION_ATTRIBUTE}], .section-resize-handle`;

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

export function getGpuNodeResizeCursor(
  direction: GpuNodeResizeDirection,
): string {
  return RESIZE_CURSOR_BY_DIRECTION[direction];
}

export function isGpuNodeResizeDirection(
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

function toElement(target: EventTarget | Node | null): Element | null {
  if (target instanceof Element) {
    return target;
  }
  if (target instanceof Node) {
    return target.parentElement;
  }
  return null;
}
