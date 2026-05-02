import { NO_WHEEL_CLASS_NAME } from "utils/constants";
import type { GpuNodeLayout } from "./GpuNodeLayer";
import {
  createHtmlSurfaceHitScene,
  resolveHtmlSurfaceHitAtClientPoint,
  type HtmlSurfaceFlatHitSurface,
} from "./htmlSurfaces/hitScene";
import { resolveGpuNodeZIndex } from "./nodeZIndex";
import { type GpuViewportInput } from "./viewportMath";

type GpuNodeTargetDescriptor =
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

export type GpuNodeSourceProjection = {
  readonly clientX: number;
  readonly clientY: number;
  readonly localX: number;
  readonly localY: number;
  readonly node: GpuNodeLayout;
  readonly nodeId: string;
  readonly sourceElement: HTMLElement;
  readonly surfaceX: number;
  readonly surfaceY: number;
};

type ResolveGpuNodePointerHandoffTargetInput = {
  readonly clientX: number;
  readonly clientY: number;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly nodes: readonly GpuNodeLayout[];
  readonly projectSourceForHitTesting?:
    | ((projection: GpuNodeSourceProjection) => void)
    | undefined;
  readonly surfaceElement: HTMLElement;
  readonly viewport: GpuViewportInput;
};

const RESIZE_HANDLE_SELECTOR = ".section-resize-handle";

const INTERACTIVE_TARGET_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "audio[controls]",
  "iframe",
  "video[controls]",
  "[contenteditable]:not([contenteditable='false'])",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[data-gpu-flow-control]",
  "[data-gpu-flow-interactive='true']",
  "[data-section-main-editor]",
  "[role='button']",
  "[role='combobox']",
  "[role='menuitem']",
  "[role='searchbox']",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='switch']",
  "[role='textbox']",
  RESIZE_HANDLE_SELECTOR,
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
  projectSourceForHitTesting,
  surfaceElement,
  viewport,
}: ResolveGpuNodePointerHandoffTargetInput): GpuNodePointerHandoffTarget | null {
  const hit = resolveTopmostGpuNodeHitAtClientPoint({
    clientX,
    clientY,
    nodes,
    surfaceElement,
    viewport,
  });
  if (!hit) {
    return null;
  }

  const nodeElement = elementByNodeId.get(hit.node.nodeId);
  if (!nodeElement) {
    return null;
  }
  projectSourceForHitTesting?.({
    clientX,
    clientY,
    localX: hit.localX,
    localY: hit.localY,
    node: hit.node,
    nodeId: hit.node.nodeId,
    sourceElement: nodeElement,
    surfaceX: hit.surfaceX,
    surfaceY: hit.surfaceY,
  });
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
    nodeId: hit.node.nodeId,
  };
}

export function resolveGpuNodeWheelHandoffTarget({
  clientX,
  clientY,
  elementByNodeId,
  nodes,
  projectSourceForHitTesting,
  surfaceElement,
  viewport,
}: ResolveGpuNodePointerHandoffTargetInput): GpuNodePointerHandoffTarget | null {
  const hit = resolveTopmostGpuNodeHitAtClientPoint({
    clientX,
    clientY,
    nodes,
    surfaceElement,
    viewport,
  });
  if (!hit) {
    return null;
  }

  const nodeElement = elementByNodeId.get(hit.node.nodeId);
  if (!nodeElement) {
    return null;
  }
  projectSourceForHitTesting?.({
    clientX,
    clientY,
    localX: hit.localX,
    localY: hit.localY,
    node: hit.node,
    nodeId: hit.node.nodeId,
    sourceElement: nodeElement,
    surfaceX: hit.surfaceX,
    surfaceY: hit.surfaceY,
  });
  const target =
    findWheelTargetAtClientPoint({
      clientX,
      clientY,
      root: nodeElement,
    }) ??
    findScrollableTargetAtClientPoint({
      clientX,
      clientY,
      root: nodeElement,
    }) ??
    findNearestScrollableWheelTarget({
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
    nodeId: hit.node.nodeId,
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
  return Boolean(element && findClosestGpuNodeInteractiveElement(element));
}

export function isGpuNodeResizeHandleEventTarget(
  target: EventTarget | Node | null,
): boolean {
  const element = toElement(target);
  return Boolean(element?.closest(RESIZE_HANDLE_SELECTOR));
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

function findInteractiveTargetAtClientPoint({
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

function findWheelTargetAtClientPoint({
  clientX,
  clientY,
  root,
}: {
  readonly clientX: number;
  readonly clientY: number;
  readonly root: HTMLElement;
}): HTMLElement | null {
  const explicitTarget = findSmallestContainingElement(
    getNativeWheelTargetCandidates(root),
    clientX,
    clientY,
  );
  if (!explicitTarget) {
    return null;
  }
  return (
    findSmallestContainingElement(
      getScrollableDescendantCandidates(explicitTarget),
      clientX,
      clientY,
    ) ?? explicitTarget
  );
}

function findNearestScrollableWheelTarget({
  clientX,
  clientY,
  root,
}: {
  readonly clientX: number;
  readonly clientY: number;
  readonly root: HTMLElement;
}): HTMLElement | null {
  let match: HTMLElement | null = null;
  let matchDistance = Number.POSITIVE_INFINITY;
  for (const candidate of getNativeWheelTargetCandidates(root)) {
    const scrollTarget =
      findNearestScrollableDescendant(candidate, clientX, clientY) ??
      (isScrollableElement(candidate) ? candidate : null);
    if (!scrollTarget) {
      continue;
    }
    const distance = getDistanceSquaredToElementRect(
      scrollTarget,
      clientX,
      clientY,
    );
    if (distance < matchDistance) {
      match = scrollTarget;
      matchDistance = distance;
    }
  }
  return match;
}

function findScrollableTargetAtClientPoint({
  clientX,
  clientY,
  root,
}: {
  readonly clientX: number;
  readonly clientY: number;
  readonly root: HTMLElement;
}): HTMLElement | null {
  return findSmallestContainingElement(
    getScrollableDescendantCandidates(root),
    clientX,
    clientY,
  );
}

function findNearestScrollableDescendant(
  root: HTMLElement,
  clientX: number,
  clientY: number,
): HTMLElement | null {
  let match: HTMLElement | null = null;
  let matchDistance = Number.POSITIVE_INFINITY;
  for (const candidate of getScrollableDescendantCandidates(root)) {
    const distance = getDistanceSquaredToElementRect(
      candidate,
      clientX,
      clientY,
    );
    if (distance < matchDistance) {
      match = candidate;
      matchDistance = distance;
    }
  }
  return match;
}

export function resolveTopmostGpuNodeHitAtClientPoint({
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
}): {
  readonly localX: number;
  readonly localY: number;
  readonly node: GpuNodeLayout;
  readonly surfaceX: number;
  readonly surfaceY: number;
} | null {
  const nodeById = new Map<string, GpuNodeLayout>();
  const flatSurfaces: HtmlSurfaceFlatHitSurface[] = [];
  nodes.forEach((node, sourceIndex) => {
    nodeById.set(node.nodeId, node);
    const surface = toFlatNodeHitSurface(node, sourceIndex);
    if (surface) {
      flatSurfaces.push(surface);
    }
  });
  const hit = resolveHtmlSurfaceHitAtClientPoint({
    clientX,
    clientY,
    scene: createHtmlSurfaceHitScene({ flatSurfaces }),
    surfaceElement,
    viewport,
  });
  if (!hit) {
    return null;
  }
  const node = nodeById.get(hit.surfaceId);
  if (!node) {
    return null;
  }
  return {
    localX: hit.localX,
    localY: hit.localY,
    node,
    surfaceX: hit.surfaceX,
    surfaceY: hit.surfaceY,
  };
}

function toFlatNodeHitSurface(
  node: GpuNodeLayout,
  sourceIndex: number,
): HtmlSurfaceFlatHitSurface | null {
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
    kind: "flat",
    stackOrder: sourceIndex,
    surfaceId: node.nodeId,
    width: node.width,
    x: node.x,
    y: node.y,
    zIndex: resolveGpuNodeZIndex(node),
  };
}

function getInteractiveTargetCandidates(root: HTMLElement): HTMLElement[] {
  const candidates: HTMLElement[] = [];
  if (isGpuNodeInteractiveElement(root)) {
    candidates.push(root);
  }
  for (const candidate of root.querySelectorAll<HTMLElement>(
    INTERACTIVE_TARGET_SELECTOR,
  )) {
    if (isGpuNodeInteractiveElement(candidate)) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

function findClosestGpuNodeInteractiveElement(
  element: Element,
): HTMLElement | null {
  let current: Element | null = element;
  while (current) {
    const candidate = current.closest<HTMLElement>(INTERACTIVE_TARGET_SELECTOR);
    if (!candidate) {
      return null;
    }
    if (isGpuNodeInteractiveElement(candidate)) {
      return candidate;
    }
    current = candidate.parentElement;
  }
  return null;
}

function isGpuNodeInteractiveElement(element: HTMLElement): boolean {
  return (
    element.matches(INTERACTIVE_TARGET_SELECTOR) &&
    !isDndKitDraggableRoleWrapper(element)
  );
}

function isDndKitDraggableRoleWrapper(element: HTMLElement): boolean {
  return (
    element.getAttribute("role") === "button" &&
    element.getAttribute("aria-roledescription") === "draggable"
  );
}

function getNativeWheelTargetCandidates(root: HTMLElement): HTMLElement[] {
  const candidates: HTMLElement[] = [];
  if (isNativeWheelTargetCandidate(root)) {
    candidates.push(root);
  }
  for (const candidate of root.querySelectorAll<HTMLElement>(
    `.${NO_WHEEL_CLASS_NAME}, [data-gpu-flow-wheel-target="true"]`,
  )) {
    candidates.push(candidate);
  }
  return candidates;
}

function getScrollableDescendantCandidates(root: HTMLElement): HTMLElement[] {
  const candidates: HTMLElement[] = [];
  if (isScrollableElement(root)) {
    candidates.push(root);
  }
  for (const candidate of root.querySelectorAll<HTMLElement>("*")) {
    if (isScrollableElement(candidate)) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

function isNativeWheelTargetCandidate(element: HTMLElement): boolean {
  return (
    element.classList.contains(NO_WHEEL_CLASS_NAME) ||
    element.dataset.gpuFlowWheelTarget === "true"
  );
}

function isScrollableElement(element: HTMLElement): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const scrollableY =
    isScrollableOverflowValue(style?.overflowY) &&
    element.scrollHeight > element.clientHeight;
  const scrollableX =
    isScrollableOverflowValue(style?.overflowX) &&
    element.scrollWidth > element.clientWidth;
  return scrollableY || scrollableX;
}

function isScrollableOverflowValue(value: string | undefined): boolean {
  return value === "auto" || value === "overlay" || value === "scroll";
}

function findSmallestContainingElement(
  candidates: readonly HTMLElement[],
  clientX: number,
  clientY: number,
): HTMLElement | null {
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

function getDistanceSquaredToElementRect(
  element: HTMLElement,
  clientX: number,
  clientY: number,
): number {
  const rect = element.getBoundingClientRect();
  const dx =
    clientX < rect.left
      ? rect.left - clientX
      : clientX > rect.right
        ? clientX - rect.right
        : 0;
  const dy =
    clientY < rect.top
      ? rect.top - clientY
      : clientY > rect.bottom
        ? clientY - rect.bottom
        : 0;
  return dx * dx + dy * dy;
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
