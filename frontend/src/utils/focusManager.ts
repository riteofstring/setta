import { movePaneToIncludeElement } from "gpuFlow/flowGeometry";
import { useEffect, type RefObject } from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import {
  getCurrEffectiveSectionImpl,
  getTopLevelSectionIdsForDisplay,
} from "state/actions/sectionInfos";
import { useProjectState, useSectionRefs } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";

type TabScopeBehavior = "default" | "canvas";

type TabScopeRegistration = {
  scopeId: string;
  order: number;
  rootRef: RefObject<HTMLElement>;
  behavior?: TabScopeBehavior;
};

const tabScopes = new Map<string, TabScopeRegistration>();
const lastFocusedByScope = new Map<string, HTMLElement>();
let focusTrackingInitialized = false;

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"]):not([role="menubar"])';
const CODE_MIRROR_ROOT_SELECTORS = [
  ".cm-editor",
  "[id^='CodeMirror-']",
  ".cm-theme",
] as const;
const TAB_NAVIGABLE_SELECTOR = "[tabindex]:not([tabindex='-1'])";

function isCodeMirrorContentElement(element: HTMLElement): boolean {
  return element.classList.contains("cm-content") || element.isContentEditable;
}

function findClosestTabNavigableAncestor(
  element: HTMLElement,
  selectors: readonly string[],
): HTMLElement | null {
  for (const selector of selectors) {
    const candidate = element.closest(selector);
    if (candidate instanceof HTMLElement && candidate.tabIndex >= 0) {
      return candidate;
    }
  }
  return null;
}

function getCodeMirrorFocusableRoot(element: HTMLElement): HTMLElement | null {
  return (
    findClosestTabNavigableAncestor(element, CODE_MIRROR_ROOT_SELECTORS) ??
    findClosestTabNavigableAncestor(element, [TAB_NAVIGABLE_SELECTOR])
  );
}

function normalizeFocusableElement(element: HTMLElement): HTMLElement {
  if (!isCodeMirrorContentElement(element)) {
    return element;
  }
  return getCodeMirrorFocusableRoot(element) ?? element;
}

export function useTabScope({
  scopeId,
  order,
  rootRef,
  behavior = "default",
}: TabScopeRegistration) {
  useEffect(() => {
    ensureFocusTracking();
    tabScopes.set(scopeId, { scopeId, order, rootRef, behavior });
    return () => {
      tabScopes.delete(scopeId);
      lastFocusedByScope.delete(scopeId);
    };
  }, [scopeId, order, rootRef, behavior]);
}

type TabNavigationOptions = {
  target: HTMLElement;
  direction: 1 | -1;
  allowInputTarget?: boolean;
};

function performTabNavigation({
  target,
  direction,
  allowInputTarget = false,
}: TabNavigationOptions): boolean {
  const normalizedTarget = normalizeFocusableElement(target);
  if (shouldUseNativeTabNavigation(normalizedTarget, allowInputTarget)) {
    return false;
  }

  const orderedScopes = getOrderedScopes();
  const startScope = getStartScope(orderedScopes, normalizedTarget, direction);
  if (!startScope) {
    return false;
  }

  const focusResult = resolveNextFocusable({
    startScope,
    orderedScopes,
    direction,
    target: normalizedTarget,
  });
  if (!focusResult) {
    return false;
  }

  return applyFocusResult(focusResult);
}

export function handleTabNavigation(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) {
    return false;
  }
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) {
    return false;
  }
  const direction = event.shiftKey ? -1 : 1;
  return performTabNavigation({ target, direction });
}

export function moveFocus({
  direction,
  from,
}: {
  direction: 1 | -1;
  from?: HTMLElement | null;
}): boolean {
  const target =
    from ??
    (document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null);
  if (!target) {
    return false;
  }
  return performTabNavigation({
    target,
    direction,
    allowInputTarget: true,
  });
}

export function focusScope(scopeId: string): boolean {
  const scope = tabScopes.get(scopeId);
  if (!scope || !scope.rootRef.current) {
    return false;
  }
  const storedElement = getStoredFocusedElement(scope);
  const focusables = storedElement ? null : getFocusableElementsForScope(scope);
  const element = storedElement ?? focusables?.[0] ?? null;
  if (!element) {
    return false;
  }
  element.focus({ preventScroll: true });
  if (scope.behavior === "canvas") {
    movePaneToIncludeElement(element);
  }
  return true;
}

export function focusAdjacentTopLevelSection({
  direction,
  focusOnFirstElement = true,
  setActive = true,
}: {
  direction: 1 | -1;
  focusOnFirstElement?: boolean;
  setActive?: boolean;
}): boolean {
  const orderedSectionIds = getOrderedTopLevelSectionIds();
  const activeElement = getActiveCanvasElement();
  const targetId = getAdjacentTopLevelSectionId(
    activeElement,
    orderedSectionIds,
    direction,
  );
  if (!targetId) {
    return false;
  }
  if (setActive) {
    applyActiveSectionChange({ interaction: "go-to", sectionId: targetId });
  }
  focusOnSection(null, targetId, focusOnFirstElement);
  return true;
}

export function focusOnSection(
  event: KeyboardEvent | null,
  sectionId: string,
  focusOnFirstElement = true,
) {
  event?.preventDefault();
  const state = useProjectState.getState();
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  const refs = useSectionRefs.getState();

  if (impl.type === SectionTypeEnum.Group) {
    const groupRef = refs.withNested[sectionId];
    if (!groupRef) {
      return;
    }
    groupRef.focus({ preventScroll: true });
    movePaneToIncludeElement(groupRef);
    return;
  }

  if (focusOnFirstElement) {
    const sectionRoot = refs.selfOnly[sectionId];
    const firstFocusable = sectionRoot
      ? getFocusableElements(sectionRoot)[0]
      : null;
    if (firstFocusable) {
      firstFocusable.focus({ preventScroll: true });
      movePaneToIncludeElement(firstFocusable);
      return;
    }
  }

  const sectionRef = refs.withNested[sectionId];
  if (!sectionRef) {
    return;
  }
  sectionRef.focus({ preventScroll: true });
  movePaneToIncludeElement(sectionRef);
}

function resolveNextFocusable({
  startScope,
  orderedScopes,
  direction,
  target,
}: {
  startScope: TabScopeRegistration;
  orderedScopes: TabScopeRegistration[];
  direction: number;
  target: HTMLElement;
}): { element: HTMLElement; scope: TabScopeRegistration } | null {
  const scopeIndex = orderedScopes.findIndex(
    (scope) => scope.scopeId === startScope.scopeId,
  );
  if (scopeIndex === -1) {
    return null;
  }

  const focusables = getFocusableElementsForScope(startScope);
  const currentElement = resolveCurrentElement(target, focusables);
  const nextElement = getNextFocusableElement(
    focusables,
    currentElement,
    direction,
  );
  if (nextElement) {
    return { element: nextElement, scope: startScope };
  }

  const nextScopeResult = findNextScopeWithFocusable(
    orderedScopes,
    scopeIndex,
    direction,
  );
  const scopedResult =
    nextScopeResult ??
    findWrapScopeWithFocusable(orderedScopes, startScope, direction);
  if (!scopedResult) {
    return null;
  }

  const fallbackElement = getFallbackElement(
    scopedResult.focusables,
    direction,
  );
  if (!fallbackElement) {
    return null;
  }

  return { element: fallbackElement, scope: scopedResult.scope };
}

function getCurrentTopLevelSectionId(
  activeElement: HTMLElement | null,
  orderedSectionIds: string[],
): string | null {
  if (!activeElement) {
    return null;
  }
  const sectionNode = activeElement.closest(".react-flow__node");
  if (!(sectionNode instanceof HTMLElement)) {
    return null;
  }
  const sectionId = sectionNode.getAttribute("data-id");
  if (!sectionId || !orderedSectionIds.includes(sectionId)) {
    return null;
  }
  return sectionId;
}

function shouldUseNativeTabNavigation(
  target: HTMLElement,
  allowInputTarget: boolean,
): boolean {
  if (target.closest("[data-tab-native]")) {
    return true;
  }
  if (allowInputTarget || !isNativeInput(target)) {
    return false;
  }
  return getScopeForElement(target)?.behavior !== "canvas";
}

function getStartScope(
  orderedScopes: TabScopeRegistration[],
  target: HTMLElement,
  direction: 1 | -1,
): TabScopeRegistration | null {
  if (orderedScopes.length === 0) {
    return null;
  }
  return (
    getScopeForElement(target) ??
    getFirstScopeWithFocusable(orderedScopes, direction > 0)
  );
}

function applyFocusResult(
  focusResult: { element: HTMLElement; scope: TabScopeRegistration } | null,
): boolean {
  if (!focusResult) {
    return false;
  }
  focusResult.element.focus({ preventScroll: true });
  if (focusResult.scope.behavior === "canvas") {
    movePaneToIncludeElement(focusResult.element);
  }
  return true;
}

function getActiveCanvasElement(): HTMLElement | null {
  const activeElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  return isElementInScope(activeElement, "canvas") ? activeElement : null;
}

function getAdjacentTopLevelSectionId(
  activeElement: HTMLElement | null,
  orderedSectionIds: string[],
  direction: 1 | -1,
): string | null {
  if (orderedSectionIds.length === 0) {
    return null;
  }
  const currentId = getCurrentTopLevelSectionId(
    activeElement,
    orderedSectionIds,
  );
  if (!currentId) {
    return getBoundarySectionId(orderedSectionIds, direction);
  }
  const currentIndex = orderedSectionIds.indexOf(currentId);
  if (currentIndex === -1) {
    return getBoundarySectionId(orderedSectionIds, direction);
  }
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= orderedSectionIds.length) {
    return null;
  }
  return orderedSectionIds[nextIndex] ?? null;
}

function getBoundarySectionId(
  orderedSectionIds: string[],
  direction: 1 | -1,
): string | null {
  if (orderedSectionIds.length === 0) {
    return null;
  }
  return direction > 0
    ? orderedSectionIds[0] ?? null
    : orderedSectionIds[orderedSectionIds.length - 1] ?? null;
}

function isElementInScope(
  element: HTMLElement | null,
  scopeId: string,
): boolean {
  if (!element) {
    return false;
  }
  const scopeRoot = element.closest("[data-tab-scope]");
  return scopeRoot?.getAttribute("data-tab-scope") === scopeId;
}

function ensureFocusTracking() {
  if (focusTrackingInitialized || typeof document === "undefined") {
    return;
  }
  focusTrackingInitialized = true;
  document.addEventListener("focusin", handleFocusIn, true);
}

function handleFocusIn(event: FocusEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) {
    return;
  }
  const normalizedTarget = normalizeFocusableElement(target);
  if (normalizedTarget.closest("[data-tab-native]")) {
    return;
  }
  const scope = getScopeForElement(normalizedTarget);
  if (!scope || !scope.rootRef.current) {
    return;
  }
  if (isFocusableElement(normalizedTarget)) {
    lastFocusedByScope.set(scope.scopeId, normalizedTarget);
    return;
  }
  const nearest = normalizedTarget.closest(FOCUSABLE_SELECTOR);
  if (!(nearest instanceof HTMLElement)) {
    return;
  }
  if (!isFocusableElement(nearest)) {
    return;
  }
  lastFocusedByScope.set(scope.scopeId, normalizeFocusableElement(nearest));
}

function getStoredFocusedElement(
  scope: TabScopeRegistration,
): HTMLElement | null {
  const stored = lastFocusedByScope.get(scope.scopeId);
  if (!stored) {
    return null;
  }
  const root = scope.rootRef.current;
  if (!stored.isConnected || !root || !root.contains(stored)) {
    lastFocusedByScope.delete(scope.scopeId);
    return null;
  }
  if (!isFocusableElement(stored)) {
    lastFocusedByScope.delete(scope.scopeId);
    return null;
  }
  return stored;
}

function findWrapScopeWithFocusable(
  orderedScopes: TabScopeRegistration[],
  currentScope: TabScopeRegistration,
  direction: number,
): { scope: TabScopeRegistration; focusables: HTMLElement[] } | null {
  const wrapScope = getFirstScopeWithFocusable(orderedScopes, direction > 0);
  if (!wrapScope || wrapScope.scopeId === currentScope.scopeId) {
    return null;
  }
  const focusables = getFocusableElementsForScope(wrapScope);
  if (focusables.length === 0) {
    return null;
  }
  return { scope: wrapScope, focusables };
}

function getOrderedScopes(): TabScopeRegistration[] {
  return Array.from(tabScopes.values())
    .filter((scope) => scope.rootRef.current)
    .sort((a, b) => a.order - b.order);
}

function getScopeForElement(element: HTMLElement): TabScopeRegistration | null {
  const scopeRoot = element.closest("[data-tab-scope]");
  if (!scopeRoot) {
    return null;
  }
  const scopeId = scopeRoot.getAttribute("data-tab-scope");
  if (!scopeId) {
    return null;
  }
  return tabScopes.get(scopeId) ?? null;
}

function getFirstScopeWithFocusable(
  orderedScopes: TabScopeRegistration[],
  forward: boolean,
): TabScopeRegistration | null {
  const direction = forward ? 1 : -1;
  const startIndex = forward ? 0 : orderedScopes.length - 1;
  const result = findNextScopeWithFocusable(
    orderedScopes,
    startIndex - direction,
    direction,
  );
  return result?.scope ?? null;
}

function findNextScopeWithFocusable(
  orderedScopes: TabScopeRegistration[],
  startIndex: number,
  direction: number,
): { scope: TabScopeRegistration; focusables: HTMLElement[] } | null {
  let idx = startIndex + direction;
  while (idx >= 0 && idx < orderedScopes.length) {
    const scope = orderedScopes[idx];
    const focusables = getFocusableElementsForScope(scope);
    if (focusables.length > 0) {
      return { scope, focusables };
    }
    idx += direction;
  }
  return null;
}

function getFocusableElementsForScope(
  scope: TabScopeRegistration,
): HTMLElement[] {
  const root = scope.rootRef.current;
  if (!root) {
    return [];
  }
  if (scope.behavior === "canvas") {
    return getCanvasFocusableElements(root);
  }
  return getFocusableElements(root);
}

function getCanvasFocusableElements(root: HTMLElement): HTMLElement[] {
  const sectionRefs = useSectionRefs.getState().withNested;
  const orderedSectionIds = getOrderedTopLevelSectionIds();

  if (orderedSectionIds.length === 0) {
    return getFocusableElements(root);
  }

  const focusables: HTMLElement[] = [];
  for (const sectionId of orderedSectionIds) {
    const sectionRoot = sectionRefs[sectionId];
    if (!sectionRoot) {
      continue;
    }
    focusables.push(...getFocusableElements(sectionRoot));
  }

  return focusables.length > 0 ? focusables : getFocusableElements(root);
}

function getOrderedTopLevelSectionIds(): string[] {
  const state = useProjectState.getState();
  const topLevelSectionIds = getTopLevelSectionIdsForDisplay(state);
  const topLevelSections = topLevelSectionIds
    .map((sectionId) => ({
      sectionId,
      layout: state.projectConfig.topLevelSections[sectionId],
    }))
    .filter((entry) => entry.layout);

  if (topLevelSections.length === 0) {
    return [];
  }

  topLevelSections.sort((a, b) => {
    if (a.layout.y !== b.layout.y) {
      return a.layout.y - b.layout.y;
    }
    if (a.layout.x !== b.layout.x) {
      return a.layout.x - b.layout.x;
    }
    const aZ = a.layout.zIndex ?? 0;
    const bZ = b.layout.zIndex ?? 0;
    if (aZ !== bZ) {
      return aZ - bZ;
    }
    return a.sectionId.localeCompare(b.sectionId);
  });

  return topLevelSections.map((entry) => entry.sectionId);
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const elements: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  function addElement(element: HTMLElement) {
    if (seen.has(element)) {
      return;
    }
    seen.add(element);
    elements.push(element);
  }

  const normalizedRoot = normalizeFocusableElement(root);
  if (
    normalizedRoot.matches(FOCUSABLE_SELECTOR) &&
    isFocusableElement(normalizedRoot)
  ) {
    addElement(normalizedRoot);
  }
  const candidates = Array.from(
    root.querySelectorAll(FOCUSABLE_SELECTOR),
  ).filter((element): element is HTMLElement => element instanceof HTMLElement);
  for (const candidate of candidates) {
    if (candidate === root) {
      continue;
    }
    if (candidate.classList.contains("cm-content")) {
      continue;
    }
    const normalizedCandidate = normalizeFocusableElement(candidate);
    if (normalizedCandidate !== candidate && normalizedCandidate === root) {
      continue;
    }
    if (isFocusableElement(candidate)) {
      addElement(normalizedCandidate);
    }
  }
  return elements;
}

function isFocusableElement(element: HTMLElement): boolean {
  if (element.hasAttribute("disabled")) {
    return false;
  }
  if (element.getAttribute("aria-hidden") === "true") {
    return false;
  }
  if (element.getAttribute("role") === "menubar") {
    return false;
  }
  const rects = element.getClientRects();
  const isVisible = element.offsetParent !== null || rects.length > 0;
  return isVisible;
}

function resolveCurrentElement(
  target: HTMLElement,
  focusables: HTMLElement[],
): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    const normalizedActive = normalizeFocusableElement(active);
    if (focusables.includes(normalizedActive)) {
      return normalizedActive;
    }
  }
  const normalizedTarget = normalizeFocusableElement(target);
  const nearest = normalizedTarget.closest(FOCUSABLE_SELECTOR);
  if (nearest instanceof HTMLElement) {
    const normalizedNearest = normalizeFocusableElement(nearest);
    if (focusables.includes(normalizedNearest)) {
      return normalizedNearest;
    }
  }
  return null;
}

function getNextFocusableElement(
  focusables: HTMLElement[],
  current: HTMLElement | null,
  direction: number,
): HTMLElement | null {
  if (focusables.length === 0) {
    return null;
  }
  if (!current) {
    return getFallbackElement(focusables, direction);
  }
  const index = focusables.indexOf(current);
  if (index === -1) {
    return getFallbackElement(focusables, direction);
  }
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= focusables.length) {
    return null;
  }
  return focusables[nextIndex] ?? null;
}

function getFallbackElement(
  focusables: HTMLElement[],
  direction: number,
): HTMLElement | null {
  if (focusables.length === 0) {
    return null;
  }
  if (direction > 0) {
    return focusables[0] ?? null;
  }
  return focusables[focusables.length - 1] ?? null;
}

function isNativeInput(target: HTMLElement): boolean {
  if (target instanceof HTMLInputElement) {
    return true;
  }
  if (target instanceof HTMLTextAreaElement) {
    return true;
  }
  if (target instanceof HTMLSelectElement) {
    return true;
  }
  return target.isContentEditable;
}
