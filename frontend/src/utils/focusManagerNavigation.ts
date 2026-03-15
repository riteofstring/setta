import { movePaneToIncludeElement } from "forks/xyflow/core/utils/graph";
import {
  FOCUSABLE_SELECTOR,
  getFocusableElementsForScope,
  normalizeFocusableElement,
} from "./focusManagerElements";
import {
  getOrderedScopes,
  getScopeForElement,
  getStoredFocusedElement,
  type TabScopeRegistration,
} from "./focusManagerRegistry";

type TabNavigationOptions = {
  target: HTMLElement;
  direction: 1 | -1;
  allowInputTarget?: boolean;
};

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
  const scope = getOrderedScopes().find((entry) => entry.scopeId === scopeId);
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

function performTabNavigation({
  target,
  direction,
  allowInputTarget = false,
}: TabNavigationOptions): boolean {
  const normalizedTarget = normalizeFocusableElement(target);
  if (normalizedTarget.closest("[data-tab-native]")) {
    return false;
  }

  const orderedScopes = getOrderedScopes();
  if (orderedScopes.length === 0) {
    return false;
  }

  const currentScope = getScopeForElement(normalizedTarget);
  if (
    !allowInputTarget &&
    isNativeInput(normalizedTarget) &&
    currentScope?.behavior !== "canvas"
  ) {
    return false;
  }

  const startScope =
    currentScope ?? getFirstScopeWithFocusable(orderedScopes, direction > 0);
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

  focusResult.element.focus({ preventScroll: true });
  if (focusResult.scope.behavior === "canvas") {
    movePaneToIncludeElement(focusResult.element);
  }
  return true;
}

function resolveNextFocusable({
  startScope,
  orderedScopes,
  direction,
  target,
}: {
  startScope: TabScopeRegistration;
  orderedScopes: TabScopeRegistration[];
  direction: 1 | -1;
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

function findWrapScopeWithFocusable(
  orderedScopes: TabScopeRegistration[],
  currentScope: TabScopeRegistration,
  direction: 1 | -1,
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

function getFirstScopeWithFocusable(
  orderedScopes: TabScopeRegistration[],
  forward: boolean,
): TabScopeRegistration | null {
  const direction: 1 | -1 = forward ? 1 : -1;
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
  direction: 1 | -1,
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
  if (!(nearest instanceof HTMLElement)) {
    return null;
  }
  const normalizedNearest = normalizeFocusableElement(nearest);
  return focusables.includes(normalizedNearest) ? normalizedNearest : null;
}

function getNextFocusableElement(
  focusables: HTMLElement[],
  current: HTMLElement | null,
  direction: 1 | -1,
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
  direction: 1 | -1,
): HTMLElement | null {
  if (focusables.length === 0) {
    return null;
  }
  return direction > 0
    ? focusables[0] ?? null
    : focusables[focusables.length - 1] ?? null;
}

function isNativeInput(target: HTMLElement): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}
