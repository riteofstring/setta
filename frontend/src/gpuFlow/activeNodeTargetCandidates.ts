import { NO_WHEEL_CLASS_NAME } from "utils/constants";
import { GPU_NODE_RESIZE_HANDLE_SELECTOR } from "./resizeHandles";

export type GpuNodeTargetCandidateCache = {
  descendantCandidates: readonly HTMLElement[] | null;
  interactiveCandidates: readonly HTMLElement[] | null;
  lastInteractiveTarget: HTMLElement | null;
  lastWheelTarget: HTMLElement | null;
  nativeWheelCandidates: readonly HTMLElement[] | null;
  readonly observer: MutationObserver;
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

const TARGET_CANDIDATE_CACHE_ATTRIBUTE_FILTER = [
  "aria-roledescription",
  "class",
  "contenteditable",
  "data-chat-window-instance-id",
  "data-gpu-flow-control",
  "data-gpu-flow-interactive",
  "data-gpu-flow-wheel-target",
  "data-id",
  "data-project-chat-window-title",
  "data-resize-axis",
  "data-resize-direction",
  "data-section-id",
  "data-section-main-editor",
  "data-testid",
  "id",
  "name",
  "role",
  "style",
  "type",
] as const;

const targetCandidateCacheByRoot = new WeakMap<
  HTMLElement,
  GpuNodeTargetCandidateCache
>();

export function clearGpuNodeTargetingCache(root: HTMLElement): void {
  const cache = targetCandidateCacheByRoot.get(root);
  if (!cache) {
    return;
  }
  cache.observer.disconnect();
  targetCandidateCacheByRoot.delete(root);
}

export function prepareGpuNodeTargetCandidateCache(
  root: HTMLElement,
): GpuNodeTargetCandidateCache | null {
  const Observer = root.ownerDocument.defaultView?.MutationObserver;
  if (!Observer) {
    return null;
  }
  let cache = targetCandidateCacheByRoot.get(root);
  if (!cache) {
    let nextCache: GpuNodeTargetCandidateCache;
    const observer = new Observer(() => {
      invalidateTargetCandidateCache(nextCache);
    });
    nextCache = {
      descendantCandidates: null,
      interactiveCandidates: null,
      lastInteractiveTarget: null,
      lastWheelTarget: null,
      nativeWheelCandidates: null,
      observer,
    };
    cache = nextCache;
    cache.observer.observe(root, {
      attributeFilter: [...TARGET_CANDIDATE_CACHE_ATTRIBUTE_FILTER],
      attributes: true,
      childList: true,
      subtree: true,
    });
    targetCandidateCacheByRoot.set(root, cache);
    return cache;
  }

  if (cache.observer.takeRecords().length > 0) {
    invalidateTargetCandidateCache(cache);
  }
  return cache;
}

export function getInteractiveTargetCandidates(
  root: HTMLElement,
  preparedCache?: GpuNodeTargetCandidateCache | null,
): HTMLElement[] {
  const cache =
    preparedCache === undefined
      ? prepareGpuNodeTargetCandidateCache(root)
      : preparedCache;
  if (cache) {
    if (!cache.interactiveCandidates) {
      cache.interactiveCandidates = collectInteractiveTargetCandidates(root);
    }
    return filterCachedCandidates(
      root,
      cache.interactiveCandidates,
      isGpuNodeInteractiveElement,
    );
  }
  return collectInteractiveTargetCandidates(root);
}

export function getNativeWheelTargetCandidates(
  root: HTMLElement,
  preparedCache?: GpuNodeTargetCandidateCache | null,
): HTMLElement[] {
  const cache =
    preparedCache === undefined
      ? prepareGpuNodeTargetCandidateCache(root)
      : preparedCache;
  if (cache) {
    if (!cache.nativeWheelCandidates) {
      cache.nativeWheelCandidates = collectNativeWheelTargetCandidates(root);
    }
    return filterCachedCandidates(
      root,
      cache.nativeWheelCandidates,
      isNativeWheelTargetCandidate,
    );
  }
  return collectNativeWheelTargetCandidates(root);
}

export function getScrollableDescendantCandidates(
  root: HTMLElement,
  preparedCache?: GpuNodeTargetCandidateCache | null,
): HTMLElement[] {
  const cache =
    preparedCache === undefined
      ? prepareGpuNodeTargetCandidateCache(root)
      : preparedCache;
  const candidates = cache
    ? (cache.descendantCandidates ??= collectDescendantCandidates(root))
    : collectDescendantCandidates(root);
  const scrollableCandidates = filterCachedCandidates(
    root,
    candidates,
    isScrollableElement,
  );
  if (isScrollableElement(root)) {
    scrollableCandidates.unshift(root);
  }
  return scrollableCandidates;
}

export function findClosestGpuNodeInteractiveElement(
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

export function isGpuNodeInteractiveElement(element: HTMLElement): boolean {
  return (
    element.matches(INTERACTIVE_TARGET_SELECTOR) &&
    !isDndKitDraggableRoleWrapper(element)
  );
}

export function isScrollableElement(element: HTMLElement): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const scrollableY =
    isScrollableOverflowValue(style?.overflowY) &&
    element.scrollHeight > element.clientHeight;
  const scrollableX =
    isScrollableOverflowValue(style?.overflowX) &&
    element.scrollWidth > element.clientWidth;
  return scrollableY || scrollableX;
}

export function isWheelHandoffTarget(element: HTMLElement): boolean {
  return isNativeWheelTargetCandidate(element) || isScrollableElement(element);
}

function collectInteractiveTargetCandidates(root: HTMLElement): HTMLElement[] {
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

function collectNativeWheelTargetCandidates(root: HTMLElement): HTMLElement[] {
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

function collectDescendantCandidates(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("*"));
}

function invalidateTargetCandidateCache(
  cache: GpuNodeTargetCandidateCache,
): void {
  cache.descendantCandidates = null;
  cache.interactiveCandidates = null;
  cache.lastInteractiveTarget = null;
  cache.lastWheelTarget = null;
  cache.nativeWheelCandidates = null;
}

function filterCachedCandidates(
  root: HTMLElement,
  candidates: readonly HTMLElement[],
  predicate: (element: HTMLElement) => boolean,
): HTMLElement[] {
  return candidates.filter(
    (candidate) => root.contains(candidate) && predicate(candidate),
  );
}

function isNativeWheelTargetCandidate(element: HTMLElement): boolean {
  return (
    element.classList.contains(NO_WHEEL_CLASS_NAME) ||
    element.dataset.gpuFlowWheelTarget === "true"
  );
}

function isScrollableOverflowValue(value: string | undefined): boolean {
  return value === "auto" || value === "overlay" || value === "scroll";
}

function isDndKitDraggableRoleWrapper(element: HTMLElement): boolean {
  return (
    element.getAttribute("role") === "button" &&
    element.getAttribute("aria-roledescription") === "draggable"
  );
}
