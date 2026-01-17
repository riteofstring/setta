import { movePaneToIncludeElement } from "forks/xyflow/core/utils/graph";
import { useEffect, type RefObject } from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
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

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"]):not([role="menubar"])';

export function useTabScope({
  scopeId,
  order,
  rootRef,
  behavior = "default",
}: TabScopeRegistration) {
  useEffect(() => {
    tabScopes.set(scopeId, { scopeId, order, rootRef, behavior });
    return () => {
      tabScopes.delete(scopeId);
    };
  }, [scopeId, order, rootRef, behavior]);
}

export function handleTabNavigation(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) {
    return false;
  }

  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) {
    return false;
  }

  if (target.closest("[data-tab-native]")) {
    return false;
  }

  const orderedScopes = getOrderedScopes();
  if (orderedScopes.length === 0) {
    return false;
  }

  const currentScope = getScopeForElement(target);
  const isInputTarget = isNativeInput(target);
  if (isInputTarget && currentScope?.behavior !== "canvas") {
    return false;
  }

  const direction = event.shiftKey ? -1 : 1;
  const startScope =
    currentScope ??
    getFirstScopeWithFocusable(orderedScopes, direction > 0, target);
  if (!startScope) {
    return false;
  }

  const focusResult = resolveNextFocusable({
    startScope,
    orderedScopes,
    direction,
    target,
  });
  if (!focusResult) {
    return false;
  }

  focusResult.element.focus({ preventScroll: true });
  if (focusResult.scope.behavior === "canvas") {
    movePaneToIncludeElement(focusResult.element);
  }
  return true;
}

export function focusOnSection(
  event: { preventDefault?: () => void } | null,
  sectionId: string,
  focusOnFirstElement = true,
) {
  event?.preventDefault?.();
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

export function focusOnSectionSearch(sectionId: string) {
  const element = document.getElementById(`${sectionId}-search`);
  element?.focus({ preventScroll: true });
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

  const scopeFocusables = getFocusableElementsForScope(startScope, target);
  const groupRoot =
    startScope.behavior === "canvas"
      ? null
      : getTabGroupRoot(target, startScope);
  const groupFocusables = groupRoot ? getFocusableElements(groupRoot) : null;
  const focusables = groupFocusables ?? scopeFocusables;

  let currentElement = resolveCurrentElement(target, focusables);
  let nextElement = getNextFocusableElement(
    focusables,
    currentElement,
    direction,
  );
  if (!nextElement && groupFocusables) {
    currentElement = resolveCurrentElement(target, scopeFocusables);
    nextElement = getNextFocusableElement(
      scopeFocusables,
      currentElement,
      direction,
    );
  }
  if (nextElement) {
    return { element: nextElement, scope: startScope };
  }

  const nextScopeResult = findNextScopeWithFocusable(
    orderedScopes,
    scopeIndex,
    direction,
    target,
  );
  const scopedResult =
    nextScopeResult ??
    findWrapScopeWithFocusable(orderedScopes, startScope, direction, target);
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

function findWrapScopeWithFocusable(
  orderedScopes: TabScopeRegistration[],
  currentScope: TabScopeRegistration,
  direction: number,
  target: HTMLElement,
): { scope: TabScopeRegistration; focusables: HTMLElement[] } | null {
  const wrapScope = getFirstScopeWithFocusable(
    orderedScopes,
    direction > 0,
    target,
  );
  if (!wrapScope || wrapScope.scopeId === currentScope.scopeId) {
    return null;
  }
  const focusables = getFocusableElementsForScope(wrapScope, target);
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

function getTabGroupRoot(
  target: HTMLElement,
  scope: TabScopeRegistration,
): HTMLElement | null {
  const groupRoot = target.closest("[data-tab-group]");
  const scopeRoot = scope.rootRef.current;
  if (!groupRoot || !scopeRoot) {
    return null;
  }
  return scopeRoot.contains(groupRoot) ? groupRoot : null;
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
  target: HTMLElement,
): TabScopeRegistration | null {
  const direction = forward ? 1 : -1;
  const startIndex = forward ? 0 : orderedScopes.length - 1;
  const result = findNextScopeWithFocusable(
    orderedScopes,
    startIndex - direction,
    direction,
    target,
  );
  return result?.scope ?? null;
}

function findNextScopeWithFocusable(
  orderedScopes: TabScopeRegistration[],
  startIndex: number,
  direction: number,
  target: HTMLElement,
): { scope: TabScopeRegistration; focusables: HTMLElement[] } | null {
  let idx = startIndex + direction;
  while (idx >= 0 && idx < orderedScopes.length) {
    const scope = orderedScopes[idx];
    const focusables = getFocusableElementsForScope(scope, target);
    if (focusables.length > 0) {
      return { scope, focusables };
    }
    idx += direction;
  }
  return null;
}

function getFocusableElementsForScope(
  scope: TabScopeRegistration,
  target: HTMLElement,
): HTMLElement[] {
  const root = scope.rootRef.current;
  if (!root) {
    return [];
  }
  if (scope.behavior === "canvas") {
    return getCanvasFocusableElements(root, target);
  }
  return getFocusableElements(root);
}

function getCanvasFocusableElements(
  root: HTMLElement,
  target: HTMLElement,
): HTMLElement[] {
  const state = useProjectState.getState();
  const sectionRoot = getSectionScopeRoot(target, state);
  if (sectionRoot) {
    const scopedFocusables = getFocusableElements(sectionRoot);
    if (scopedFocusables.length > 0) {
      return scopedFocusables;
    }
  }

  const sectionRefs = useSectionRefs.getState().withNested;
  const activeSectionId = state.projectConfig.activeIds[0] ?? null;
  if (activeSectionId) {
    const activeRef = sectionRefs[activeSectionId];
    if (activeRef) {
      const activeFocusables = getFocusableElements(activeRef);
      if (activeFocusables.length > 0) {
        return activeFocusables;
      }
    }
  }
  const topLevelSections = Object.entries(
    state.projectConfig.topLevelSections,
  ).map(([sectionId, layout]) => ({
    sectionId,
    layout,
  }));

  if (topLevelSections.length === 0) {
    return getFocusableElements(root);
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

  const focusables: HTMLElement[] = [];
  for (const { sectionId } of topLevelSections) {
    const sectionRoot = sectionRefs[sectionId];
    if (!sectionRoot) {
      continue;
    }
    focusables.push(...getFocusableElements(sectionRoot));
  }

  return focusables.length > 0 ? focusables : getFocusableElements(root);
}

function getSectionScopeRoot(
  target: HTMLElement,
  state: ReturnType<typeof useProjectState.getState>,
): HTMLElement | null {
  let current: HTMLElement | null = target;
  let nearestRoot: HTMLElement | null = null;
  while (current) {
    if (current.hasAttribute("data-section-root")) {
      if (!nearestRoot) {
        nearestRoot = current;
      }
      const sectionId = current.getAttribute("data-section-root");
      if (sectionId && state.sections[sectionId]) {
        const impl = getCurrEffectiveSectionImpl(state, sectionId);
        if (impl.type === SectionTypeEnum.Group) {
          return current;
        }
      }
    }
    current = current.parentElement;
  }
  return nearestRoot;
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const elements: HTMLElement[] = [];
  if (root.matches(FOCUSABLE_SELECTOR) && isFocusableElement(root)) {
    elements.push(root);
  }
  const candidates = Array.from(
    root.querySelectorAll(FOCUSABLE_SELECTOR),
  ).filter((element): element is HTMLElement => element instanceof HTMLElement);
  for (const candidate of candidates) {
    if (candidate === root) {
      continue;
    }
    if (isFocusableElement(candidate)) {
      elements.push(candidate);
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
  if (active instanceof HTMLElement && focusables.includes(active)) {
    return active;
  }
  const nearest = target.closest(FOCUSABLE_SELECTOR);
  if (nearest instanceof HTMLElement && focusables.includes(nearest)) {
    return nearest;
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
    return direction > 0 ? getFallbackElement(focusables, direction) : null;
  }
  const index = focusables.indexOf(current);
  if (index === -1) {
    return direction > 0 ? getFallbackElement(focusables, direction) : null;
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
