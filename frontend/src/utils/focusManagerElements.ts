import { getTopLevelSectionIdsForDisplay } from "state/actions/sectionDisplayQueries";
import { useProjectState } from "state/definitions";
import { useSectionRefs } from "state/stores/layoutInteractionStores";
import type { TabScopeRegistration } from "./focusManagerRegistry";

export const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"]):not([role="menubar"])';

export function normalizeFocusableElement(element: HTMLElement): HTMLElement {
  const isCodeMirrorContent =
    element.classList.contains("cm-content") || element.isContentEditable;
  if (isCodeMirrorContent) {
    const cmEditor = element.closest(".cm-editor");
    if (cmEditor instanceof HTMLElement && cmEditor.tabIndex >= 0) {
      return cmEditor;
    }
    const codeMirrorRoot =
      element.closest("[id^='CodeMirror-']") ??
      element.closest(".cm-theme") ??
      element.closest(".cm-editor");
    if (codeMirrorRoot instanceof HTMLElement && codeMirrorRoot.tabIndex >= 0) {
      return codeMirrorRoot;
    }
    const focusableAncestor = element.closest(
      "[tabindex]:not([tabindex='-1'])",
    );
    if (focusableAncestor instanceof HTMLElement) {
      return focusableAncestor;
    }
  }
  return element;
}

export function getFocusableElementsForScope(
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

export function getCurrentTopLevelSectionId(
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

export function isElementInScope(
  element: HTMLElement | null,
  scopeId: string,
): boolean {
  if (!element) {
    return false;
  }
  const scopeRoot = element.closest("[data-tab-scope]");
  return scopeRoot?.getAttribute("data-tab-scope") === scopeId;
}

export function getOrderedTopLevelSectionIds(): string[] {
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

export function getFocusableElements(root: HTMLElement): HTMLElement[] {
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
    if (candidate === root || candidate.classList.contains("cm-content")) {
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

export function isFocusableElement(element: HTMLElement): boolean {
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
  return element.offsetParent !== null || rects.length > 0;
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
