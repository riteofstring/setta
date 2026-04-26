import type { GpuNodeLayout } from "./GpuNodeLayer";
import {
  flowToScreenPosition,
  normalizeGpuViewport,
  type GpuViewportInput,
} from "./viewportMath";

export type GpuNodeTargetDescriptor =
  | {
      readonly attribute: string;
      readonly kind: "stable-attribute";
      readonly tagName: string;
      readonly value: string;
    }
  | {
      readonly inputType: string | null;
      readonly kind: "dom-path";
      readonly path: readonly number[];
      readonly role: string | null;
      readonly tagName: string;
    };

export type GpuNodePointerHandoffTarget = {
  readonly descriptor: GpuNodeTargetDescriptor;
  readonly nodeId: string;
};

export type ResolveGpuNodePointerHandoffTargetInput = {
  readonly clientX: number;
  readonly clientY: number;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly nodes: readonly GpuNodeLayout[];
  readonly surfaceElement: HTMLElement;
  readonly viewport: GpuViewportInput;
};

const INTERACTIVE_TARGET_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[data-gpu-flow-interactive='true']",
  "[role='button']",
  "[role='combobox']",
  "[role='menuitem']",
  "[role='searchbox']",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='switch']",
  "[role='textbox']",
  ".cm-content",
  ".cm-editor",
  ".xterm",
  ".xterm-screen",
].join(",");

const STABLE_TARGET_ATTRIBUTES = [
  "data-gpu-flow-control",
  "data-testid",
  "data-section-id",
  "data-id",
  "data-chat-window-instance-id",
  "data-project-chat-window-title",
  "data-resize-direction",
  "data-resize-axis",
  "name",
  "id",
] as const;

export function resolveGpuNodePointerHandoffTarget({
  clientX,
  clientY,
  elementByNodeId,
  nodes,
  surfaceElement,
  viewport,
}: ResolveGpuNodePointerHandoffTargetInput): GpuNodePointerHandoffTarget | null {
  const node = findTopmostGpuNodeAtClientPoint({
    clientX,
    clientY,
    nodes,
    surfaceElement,
    viewport,
  });
  if (!node) {
    return null;
  }

  const nodeElement = elementByNodeId.get(node.nodeId);
  if (!nodeElement) {
    return null;
  }
  const target = findInteractiveTargetAtClientPoint({
    clientX,
    clientY,
    root: nodeElement,
  });
  if (!target) {
    return null;
  }
  const descriptor = createGpuNodeTargetDescriptor(nodeElement, target);
  if (!descriptor) {
    return null;
  }
  return {
    descriptor,
    nodeId: node.nodeId,
  };
}

export function resolveGpuNodeTargetDescriptor(
  root: HTMLElement,
  descriptor: GpuNodeTargetDescriptor,
): HTMLElement | null {
  return descriptor.kind === "stable-attribute"
    ? resolveStableAttributeTargetDescriptor(root, descriptor)
    : resolveDomPathTargetDescriptor(root, descriptor);
}

function resolveStableAttributeTargetDescriptor(
  root: HTMLElement,
  descriptor: Extract<GpuNodeTargetDescriptor, { kind: "stable-attribute" }>,
): HTMLElement | null {
  const candidates = root.getElementsByTagName(descriptor.tagName);
  let match: HTMLElement | null = null;
  for (const candidate of candidates) {
    if (
      candidate instanceof HTMLElement &&
      candidate.getAttribute(descriptor.attribute) === descriptor.value
    ) {
      if (match) {
        return null;
      }
      match = candidate;
    }
  }
  return match;
}

function resolveDomPathTargetDescriptor(
  root: HTMLElement,
  descriptor: Extract<GpuNodeTargetDescriptor, { kind: "dom-path" }>,
): HTMLElement | null {
  let current: Element = root;
  for (const index of descriptor.path) {
    const next = current.children.item(index);
    if (!next) {
      return null;
    }
    current = next;
  }
  if (!(current instanceof HTMLElement)) {
    return null;
  }
  if (current.tagName.toLowerCase() !== descriptor.tagName) {
    return null;
  }
  if ((current.getAttribute("role") ?? null) !== descriptor.role) {
    return null;
  }
  if (getInputType(current) !== descriptor.inputType) {
    return null;
  }
  return current;
}

export function isGpuNodeInteractiveEventTarget(
  target: EventTarget | Node | null,
): boolean {
  const element = toElement(target);
  return Boolean(element?.closest(INTERACTIVE_TARGET_SELECTOR));
}

export function createGpuNodeTargetDescriptor(
  root: HTMLElement,
  target: HTMLElement,
): GpuNodeTargetDescriptor | null {
  if (root !== target && !root.contains(target)) {
    return null;
  }

  for (const attribute of STABLE_TARGET_ATTRIBUTES) {
    const value = target.getAttribute(attribute);
    if (!value) {
      continue;
    }
    const descriptor = {
      attribute,
      kind: "stable-attribute" as const,
      tagName: target.tagName.toLowerCase(),
      value,
    };
    if (resolveGpuNodeTargetDescriptor(root, descriptor) === target) {
      return descriptor;
    }
  }

  const path = getElementPath(root, target);
  if (!path) {
    return null;
  }
  return {
    inputType: getInputType(target),
    kind: "dom-path",
    path,
    role: target.getAttribute("role"),
    tagName: target.tagName.toLowerCase(),
  };
}

export function findInteractiveTargetAtClientPoint({
  clientX,
  clientY,
  root,
}: {
  readonly clientX: number;
  readonly clientY: number;
  readonly root: HTMLElement;
}): HTMLElement | null {
  const candidates = getInteractiveTargetCandidates(root);
  let match: HTMLElement | null = null;
  for (const candidate of candidates) {
    if (!elementContainsClientPoint(candidate, clientX, clientY)) {
      continue;
    }
    if (
      !match ||
      match.contains(candidate) ||
      getElementRectArea(candidate) < getElementRectArea(match)
    ) {
      match = candidate;
    }
  }
  return match;
}

function findTopmostGpuNodeAtClientPoint({
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
}): GpuNodeLayout | null {
  const surfaceRect = surfaceElement.getBoundingClientRect();
  const screenX = clientX - surfaceRect.left;
  const screenY = clientY - surfaceRect.top;
  const normalizedViewport = normalizeGpuViewport(viewport);
  let match: (GpuNodeLayout & { readonly sourceIndex: number }) | null = null;

  nodes.forEach((node, sourceIndex) => {
    if (
      !gpuNodeContainsScreenPoint(node, screenX, screenY, normalizedViewport)
    ) {
      return;
    }
    if (!match || compareGpuNodeStacking(node, sourceIndex, match) > 0) {
      match = { ...node, sourceIndex };
    }
  });

  return match;
}

function gpuNodeContainsScreenPoint(
  node: GpuNodeLayout,
  screenX: number,
  screenY: number,
  viewport: ReturnType<typeof normalizeGpuViewport>,
): boolean {
  if (
    node.width === null ||
    node.height === null ||
    node.width <= 0 ||
    node.height <= 0
  ) {
    return false;
  }
  const screenPosition = flowToScreenPosition(
    { x: node.x, y: node.y },
    viewport,
  );
  const width = node.width * viewport.zoom;
  const height = node.height * viewport.zoom;
  return (
    screenX >= screenPosition.x &&
    screenX < screenPosition.x + width &&
    screenY >= screenPosition.y &&
    screenY < screenPosition.y + height
  );
}

function compareGpuNodeStacking(
  node: GpuNodeLayout,
  sourceIndex: number,
  current: GpuNodeLayout & { readonly sourceIndex: number },
): number {
  const zIndex = node.tempZIndex ?? node.zIndex ?? 0;
  const currentZIndex = current.tempZIndex ?? current.zIndex ?? 0;
  return zIndex - currentZIndex || sourceIndex - current.sourceIndex;
}

function getInteractiveTargetCandidates(root: HTMLElement): HTMLElement[] {
  const candidates: HTMLElement[] = [];
  if (root.matches(INTERACTIVE_TARGET_SELECTOR)) {
    candidates.push(root);
  }
  for (const candidate of root.querySelectorAll<HTMLElement>(
    INTERACTIVE_TARGET_SELECTOR,
  )) {
    candidates.push(candidate);
  }
  return candidates;
}

function elementContainsClientPoint(
  element: HTMLElement,
  clientX: number,
  clientY: number,
): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    clientX >= rect.left &&
    clientX < rect.right &&
    clientY >= rect.top &&
    clientY < rect.bottom
  );
}

function getElementRectArea(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height;
}

function getElementPath(
  root: HTMLElement,
  target: HTMLElement,
): readonly number[] | null {
  const path: number[] = [];
  let current: Element | null = target;
  while (current && current !== root) {
    const parent = current.parentElement;
    if (!parent) {
      return null;
    }
    const index = Array.prototype.indexOf.call(parent.children, current);
    if (index < 0) {
      return null;
    }
    path.push(index);
    current = parent;
  }
  if (current !== root) {
    return null;
  }
  return path.reverse();
}

function getInputType(element: HTMLElement): string | null {
  return element instanceof HTMLInputElement ? element.type : null;
}

function toElement(target: EventTarget | Node | null): Element | null {
  if (!target || typeof target !== "object" || !("nodeType" in target)) {
    return null;
  }

  const node = target as Node;
  if (node.nodeType === 1) {
    return node as Element;
  }
  if (node.nodeType === 3) {
    return node.parentElement;
  }
  return null;
}
