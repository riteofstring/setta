import { useEffect, type RefObject } from "react";
import { movePaneToIncludeElement } from "../canvas/viewportHelpers";
import { useSectionRefs } from "../section/sectionRefs";
import { getOrderedTopLevelSectionIds } from "./topLevelSectionOrder";

// The reference's focus-scope registry (`utils/focusManager.ts`), narrowed to the surfaces the
// package's own chrome owns: the two shell panes and the canvas between them. The reference's
// fourth scope is the application header, which the package does not have, and its cross-scope
// Tab roving belongs to the application's pane composition rather than to these chords.
//
// A scope remembers the element focus last reached inside it, so returning to a pane returns to
// the control the person left, and the canvas offers its sections in layout reading order.
export type WorkspaceFocusScopeId = "leading-pane" | "canvas" | "trailing-pane";

const WORKSPACE_FOCUS_SCOPE_IDS: ReadonlyArray<WorkspaceFocusScopeId> = Object.freeze([
  "leading-pane",
  "canvas",
  "trailing-pane",
]);

const WORKSPACE_FOCUS_SCOPE_ATTRIBUTE = "data-workspace-focus-scope";

// The reference's `FOCUSABLE_SELECTOR`. Its `[role="menubar"]` exclusion covers an application
// header the package does not have.
const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

const scopeRoots = new Map<WorkspaceFocusScopeId, HTMLElement>();
const lastFocusedByScope = new Map<WorkspaceFocusScopeId, HTMLElement>();

function isWorkspaceFocusScopeId(value: string): value is WorkspaceFocusScopeId {
  return WORKSPACE_FOCUS_SCOPE_IDS.includes(value as WorkspaceFocusScopeId);
}

// The reference decides whether a candidate is focusable by measuring client rectangles. The
// package decides it from the explicit markers its own chrome sets — a closed shell pane is
// `inert` and `aria-hidden` — so the answer does not depend on layout timing and is the same in
// a test environment as it is on screen.
function isWorkspaceFocusable(element: HTMLElement): boolean {
  return (
    element.matches(FOCUSABLE_SELECTOR) &&
    !element.hasAttribute("disabled") &&
    element.getAttribute("aria-hidden") !== "true" &&
    element.closest("[inert]") === null &&
    element.closest("[hidden]") === null
  );
}

// A live CodeMirror's content element is contenteditable, so focus genuinely lands there and the
// scope remembers it; the reference likewise keeps it out of the offered list, where the idle
// control that owns the same value is the tab stop.
export function getWorkspaceFocusableElements(root: HTMLElement): Array<HTMLElement> {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => isWorkspaceFocusable(element) && !element.classList.contains("cm-content"),
  );
}

// The reference's `getCanvasFocusableElements`: the canvas offers the controls of its top-level
// sections in layout reading order rather than in DOM order, which follows the stacking order.
// A canvas with no mounted sections falls back to whatever the wrapper itself contains.
function getCanvasFocusableElements(root: HTMLElement): Array<HTMLElement> {
  const sectionRoots = useSectionRefs.getState().withNested;
  const sectionFocusables = getOrderedTopLevelSectionIds().flatMap((sectionId) => {
    const sectionRoot = sectionRoots[sectionId];
    return sectionRoot ? getWorkspaceFocusableElements(sectionRoot) : [];
  });
  return sectionFocusables.length > 0 ? sectionFocusables : getWorkspaceFocusableElements(root);
}

function getWorkspaceFocusScopeElements(scopeId: WorkspaceFocusScopeId): Array<HTMLElement> {
  const root = scopeRoots.get(scopeId);
  if (!root) {
    return [];
  }
  return scopeId === "canvas"
    ? getCanvasFocusableElements(root)
    : getWorkspaceFocusableElements(root);
}

function getStoredFocusableElement(
  scopeId: WorkspaceFocusScopeId,
  root: HTMLElement,
): HTMLElement | null {
  const stored = lastFocusedByScope.get(scopeId);
  if (!stored) {
    return null;
  }
  // The remembered element is dropped once it leaves the scope, unmounts, or stops being
  // focusable, exactly as the reference forgets a stale target instead of focusing nothing.
  if (!stored.isConnected || !root.contains(stored) || !isWorkspaceFocusable(stored)) {
    lastFocusedByScope.delete(scopeId);
    return null;
  }
  return stored;
}

export function getWorkspaceFocusScopeId(element: HTMLElement): WorkspaceFocusScopeId | null {
  const scopeRoot = element.closest(`[${WORKSPACE_FOCUS_SCOPE_ATTRIBUTE}]`);
  const scopeId = scopeRoot?.getAttribute(WORKSPACE_FOCUS_SCOPE_ATTRIBUTE) ?? null;
  return scopeId !== null && isWorkspaceFocusScopeId(scopeId) ? scopeId : null;
}

function handleFocusIn(event: FocusEvent): void {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) {
    return;
  }
  const scopeId = getWorkspaceFocusScopeId(target);
  if (!scopeId || !isWorkspaceFocusable(target)) {
    return;
  }
  lastFocusedByScope.set(scopeId, target);
}

// Focus the scope's remembered element, or its first offered control. A scope that is not
// mounted, or that has nothing to focus, declines so its chord goes back to the browser.
export function focusWorkspaceScope(scopeId: WorkspaceFocusScopeId): boolean {
  const root = scopeRoots.get(scopeId);
  if (!root) {
    return false;
  }
  const element =
    getStoredFocusableElement(scopeId, root) ?? getWorkspaceFocusScopeElements(scopeId)[0] ?? null;
  if (!element) {
    return false;
  }
  element.focus({ preventScroll: true });
  // The reference travels the canvas to the element it focused; the panes do not move.
  if (scopeId === "canvas") {
    movePaneToIncludeElement(element);
  }
  return true;
}

// Registered by the chrome that owns the scope, for as long as it is mounted. One workspace owns
// one set of scopes: a second registration of the same scope would leave a chord with two
// possible targets, so it fails at the source instead.
export function useWorkspaceFocusScope(
  scopeId: WorkspaceFocusScopeId,
  rootRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      throw new Error(`Workspace focus scope ${scopeId} root did not mount.`);
    }
    if (scopeRoots.has(scopeId)) {
      throw new Error(`Workspace focus scope ${scopeId} is already registered.`);
    }
    root.setAttribute(WORKSPACE_FOCUS_SCOPE_ATTRIBUTE, scopeId);
    scopeRoots.set(scopeId, root);
    if (scopeRoots.size === 1) {
      document.addEventListener("focusin", handleFocusIn, true);
    }
    return () => {
      root.removeAttribute(WORKSPACE_FOCUS_SCOPE_ATTRIBUTE);
      scopeRoots.delete(scopeId);
      lastFocusedByScope.delete(scopeId);
      if (scopeRoots.size === 0) {
        document.removeEventListener("focusin", handleFocusIn, true);
      }
    };
  }, [rootRef, scopeId]);
}
