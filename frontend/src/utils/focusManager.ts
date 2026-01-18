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

function normalizeFocusableElement(element: HTMLElement): HTMLElement {
  if (element.classList.contains("cm-content")) {
    const cmEditor = element.closest(".cm-editor");
    if (cmEditor instanceof HTMLElement && cmEditor.tabIndex >= 0) {
      return cmEditor;
    }
  }
  return element;
}

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

  if (normalizedTarget.closest("[data-tab-native]")) {
    return false;
  }

  const orderedScopes = getOrderedScopes();
  if (orderedScopes.length === 0) {
    return false;
  }

  const currentScope = getScopeForElement(normalizedTarget);
  const isInputTarget = isNativeInput(normalizedTarget);
  if (!allowInputTarget && isInputTarget && currentScope?.behavior !== "canvas") {
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
    (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  if (!target) {
    return false;
  }
  return performTabNavigation({
    target,
    direction,
    allowInputTarget: true,
  });
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
  const state = useProjectState.getState();
  const sectionRefs = useSectionRefs.getState().withNested;
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

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const elements: HTMLElement[] = [];
  const normalizedRoot = normalizeFocusableElement(root);
  if (
    normalizedRoot.matches(FOCUSABLE_SELECTOR) &&
    isFocusableElement(normalizedRoot)
  ) {
    elements.push(normalizedRoot);
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
      elements.push(normalizedCandidate);
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
