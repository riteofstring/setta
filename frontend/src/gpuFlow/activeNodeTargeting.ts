import { NO_WHEEL_CLASS_NAME } from "utils/constants";
import type { GpuNodeLayout } from "./htmlSurfaces/frame";
import {
  createHtmlSurfaceHitScene,
  createHtmlSurfaceHitSceneFromVisualScene,
  resolveHtmlSurfaceHitAtClientPoint,
  type HtmlSurfaceEffectHitProjector,
  type HtmlSurfaceFlatHitSurface,
  type HtmlSurfaceHitScene,
} from "./htmlSurfaces/hitScene";
import type { HtmlSurfaceVisualScene } from "./htmlSurfaces/visualScene";
import { resolveGpuNodeZIndex } from "./nodeZIndex";
import { GPU_NODE_RESIZE_HANDLE_SELECTOR } from "./resizeHandles";
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
  readonly effectProjectors?:
    | ReadonlyMap<string, HtmlSurfaceEffectHitProjector>
    | undefined;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly nodes: readonly GpuNodeLayout[];
  readonly projectSourceForHitTesting?:
    | ((projection: GpuNodeSourceProjection) => void)
    | undefined;
  readonly requireVisualSceneHitSurfaces?: boolean | undefined;
  readonly surfaceElement: HTMLElement;
  readonly viewport: GpuViewportInput;
  readonly visualScene?: HtmlSurfaceVisualScene | undefined;
};

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
  GPU_NODE_RESIZE_HANDLE_SELECTOR,
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
  effectProjectors,
  elementByNodeId,
  nodes,
  projectSourceForHitTesting,
  requireVisualSceneHitSurfaces,
  surfaceElement,
  viewport,
  visualScene,
}: ResolveGpuNodePointerHandoffTargetInput): GpuNodePointerHandoffTarget | null {
  const hit = resolveTopmostGpuNodeHitAtClientPoint({
    clientX,
    clientY,
    effectProjectors,
    nodes,
    requireVisualSceneHitSurfaces,
    surfaceElement,
    viewport,
    visualScene,
  });
  if (!hit) {
    return null;
  }

  const nodeElement = elementByNodeId.get(hit.node.nodeId);
  if (!nodeElement) {
    return null;
  }
  const target = findInteractiveTargetAtLocalPoint({
    localX: hit.localX,
    localY: hit.localY,
    root: nodeElement,
  });
  if (!target) {
    return null;
  }
  const descriptor = createGpuNodeTargetDescriptor(nodeElement, target);
  if (!descriptor) {
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
  return {
    descriptor,
    nodeId: hit.node.nodeId,
  };
}

export function resolveGpuNodeWheelHandoffTarget({
  clientX,
  clientY,
  effectProjectors,
  elementByNodeId,
  nodes,
  projectSourceForHitTesting,
  requireVisualSceneHitSurfaces,
  surfaceElement,
  viewport,
  visualScene,
}: ResolveGpuNodePointerHandoffTargetInput): GpuNodePointerHandoffTarget | null {
  const hit = resolveTopmostGpuNodeHitAtClientPoint({
    clientX,
    clientY,
    effectProjectors,
    nodes,
    requireVisualSceneHitSurfaces,
    surfaceElement,
    viewport,
    visualScene,
  });
  if (!hit) {
    return null;
  }

  const nodeElement = elementByNodeId.get(hit.node.nodeId);
  if (!nodeElement) {
    return null;
  }
  const target =
    findWheelTargetAtLocalPoint({
      localX: hit.localX,
      localY: hit.localY,
      root: nodeElement,
    }) ??
    findScrollableTargetAtLocalPoint({
      localX: hit.localX,
      localY: hit.localY,
      root: nodeElement,
    }) ??
    findNearestScrollableWheelTargetAtLocalPoint({
      localX: hit.localX,
      localY: hit.localY,
      root: nodeElement,
    });
  if (!target) {
    return null;
  }
  const descriptor = createGpuNodeTargetDescriptor(nodeElement, target);
  if (!descriptor) {
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
  return Boolean(element?.closest(GPU_NODE_RESIZE_HANDLE_SELECTOR));
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

function findInteractiveTargetAtLocalPoint({
  localX,
  localY,
  root,
}: {
  readonly localX: number;
  readonly localY: number;
  readonly root: HTMLElement;
}): HTMLElement | null {
  const candidates = getInteractiveTargetCandidates(root);
  let match: HTMLElement | null = null;
  for (const candidate of candidates) {
    if (!elementContainsLocalPoint(candidate, root, localX, localY)) {
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

function findWheelTargetAtLocalPoint({
  localX,
  localY,
  root,
}: {
  readonly localX: number;
  readonly localY: number;
  readonly root: HTMLElement;
}): HTMLElement | null {
  const explicitTarget = findSmallestContainingElement(
    getNativeWheelTargetCandidates(root),
    root,
    localX,
    localY,
  );
  if (!explicitTarget) {
    return null;
  }
  return (
    findSmallestContainingElement(
      getScrollableDescendantCandidates(explicitTarget),
      root,
      localX,
      localY,
    ) ?? explicitTarget
  );
}

function findNearestScrollableWheelTargetAtLocalPoint({
  localX,
  localY,
  root,
}: {
  readonly localX: number;
  readonly localY: number;
  readonly root: HTMLElement;
}): HTMLElement | null {
  let match: HTMLElement | null = null;
  let matchDistance = Number.POSITIVE_INFINITY;
  for (const candidate of getNativeWheelTargetCandidates(root)) {
    const scrollTarget =
      findNearestScrollableDescendant(candidate, root, localX, localY) ??
      (isScrollableElement(candidate) ? candidate : null);
    if (!scrollTarget) {
      continue;
    }
    const distance = getDistanceSquaredToElementRect(
      scrollTarget,
      root,
      localX,
      localY,
    );
    if (distance < matchDistance) {
      match = scrollTarget;
      matchDistance = distance;
    }
  }
  return match;
}

function findScrollableTargetAtLocalPoint({
  localX,
  localY,
  root,
}: {
  readonly localX: number;
  readonly localY: number;
  readonly root: HTMLElement;
}): HTMLElement | null {
  return findSmallestContainingElement(
    getScrollableDescendantCandidates(root),
    root,
    localX,
    localY,
  );
}

function findNearestScrollableDescendant(
  root: HTMLElement,
  sourceRoot: HTMLElement,
  localX: number,
  localY: number,
): HTMLElement | null {
  let match: HTMLElement | null = null;
  let matchDistance = Number.POSITIVE_INFINITY;
  for (const candidate of getScrollableDescendantCandidates(root)) {
    const distance = getDistanceSquaredToElementRect(
      candidate,
      sourceRoot,
      localX,
      localY,
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
  effectProjectors,
  nodes,
  requireVisualSceneHitSurfaces,
  surfaceElement,
  viewport,
  visualScene,
}: {
  readonly clientX: number;
  readonly clientY: number;
  readonly effectProjectors?:
    | ReadonlyMap<string, HtmlSurfaceEffectHitProjector>
    | undefined;
  readonly nodes: readonly GpuNodeLayout[];
  readonly requireVisualSceneHitSurfaces?: boolean | undefined;
  readonly surfaceElement: HTMLElement;
  readonly viewport: GpuViewportInput;
  readonly visualScene?: HtmlSurfaceVisualScene | undefined;
}): {
  readonly localX: number;
  readonly localY: number;
  readonly node: GpuNodeLayout;
  readonly surfaceX: number;
  readonly surfaceY: number;
} | null {
  const nodeById = new Map<string, GpuNodeLayout>();
  nodes.forEach((node) => {
    nodeById.set(node.nodeId, node);
  });
  const scene = resolveGpuNodeHitScene({
    nodeById,
    nodes,
    requireVisualSceneHitSurfaces,
    visualScene,
  });
  if (!scene) {
    return null;
  }
  const hit = resolveHtmlSurfaceHitAtClientPoint({
    clientX,
    clientY,
    ...(effectProjectors ? { effectProjectors } : {}),
    scene,
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

function resolveGpuNodeHitScene({
  nodeById,
  nodes,
  requireVisualSceneHitSurfaces = false,
  visualScene,
}: {
  readonly nodeById: ReadonlyMap<string, GpuNodeLayout>;
  readonly nodes: readonly GpuNodeLayout[];
  readonly requireVisualSceneHitSurfaces?: boolean | undefined;
  readonly visualScene: HtmlSurfaceVisualScene | undefined;
}): HtmlSurfaceHitScene | null {
  if (visualScene) {
    const nodeVisualScene = filterVisualSceneBySurfaceIds(
      visualScene,
      nodeById,
    );
    if (hasVisualSceneHitSurfaces(nodeVisualScene)) {
      return createHtmlSurfaceHitSceneFromVisualScene(nodeVisualScene);
    }
  }
  if (requireVisualSceneHitSurfaces) {
    return null;
  }

  const flatSurfaces: HtmlSurfaceFlatHitSurface[] = [];
  nodes.forEach((node, sourceIndex) => {
    const surface = toFlatNodeHitSurface(node, sourceIndex);
    if (surface) {
      flatSurfaces.push(surface);
    }
  });
  return createHtmlSurfaceHitScene({ flatSurfaces });
}

function filterVisualSceneBySurfaceIds(
  scene: HtmlSurfaceVisualScene,
  surfaceIds: ReadonlyMap<string, unknown>,
): HtmlSurfaceVisualScene {
  return {
    effectSurfaces: scene.effectSurfaces.filter((surface) =>
      surfaceIds.has(surface.surfaceId),
    ),
    flatSurfaces: scene.flatSurfaces.filter((surface) =>
      surfaceIds.has(surface.surfaceId),
    ),
    meshSurfaces: scene.meshSurfaces.filter((surface) =>
      surfaceIds.has(surface.surfaceId),
    ),
    tiledFlatSurfaces: scene.tiledFlatSurfaces.filter((surface) =>
      surfaceIds.has(surface.surfaceId),
    ),
  };
}

function hasVisualSceneHitSurfaces(scene: HtmlSurfaceVisualScene): boolean {
  return (
    scene.flatSurfaces.length > 0 ||
    scene.tiledFlatSurfaces.length > 0 ||
    scene.meshSurfaces.length > 0 ||
    scene.effectSurfaces.length > 0
  );
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
  root: HTMLElement,
  localX: number,
  localY: number,
): HTMLElement | null {
  let match: HTMLElement | null = null;
  for (const candidate of candidates) {
    if (!elementContainsLocalPoint(candidate, root, localX, localY)) {
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
  root: HTMLElement,
  localX: number,
  localY: number,
): number {
  const rect = getElementLocalRect(element, root);
  const dx =
    localX < rect.left
      ? rect.left - localX
      : localX > rect.right
        ? localX - rect.right
        : 0;
  const dy =
    localY < rect.top
      ? rect.top - localY
      : localY > rect.bottom
        ? localY - rect.bottom
        : 0;
  return dx * dx + dy * dy;
}

function elementContainsLocalPoint(
  element: HTMLElement,
  root: HTMLElement,
  localX: number,
  localY: number,
): boolean {
  const rect = getElementLocalRect(element, root);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    localX >= rect.left &&
    localX < rect.right &&
    localY >= rect.top &&
    localY < rect.bottom
  );
}

function getElementLocalRect(element: HTMLElement, root: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const left = rect.left - rootRect.left;
  const top = rect.top - rootRect.top;
  return {
    bottom: top + rect.height,
    height: rect.height,
    left,
    right: left + rect.width,
    top,
    width: rect.width,
  };
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
