import { useEffect, type RefObject } from "react";
import { movePaneToIncludeElement } from "../canvas/viewportHelpers";
import { getSectionRefsStore } from "../section/sectionRefs";
import { useWorkspaceHost } from "../workspaceHostContext";
import type { WorkspaceHost } from "../workspaceHost";
import { registerWorkspaceHostCleanup } from "../workspaceHostInternals";
import { getOrderedTopLevelSectionIds } from "./topLevelSectionOrder";

export type WorkspaceFocusScopeId = "leading-pane" | "canvas" | "trailing-pane";

const WORKSPACE_FOCUS_SCOPE_IDS: ReadonlyArray<WorkspaceFocusScopeId> =
  Object.freeze(["leading-pane", "canvas", "trailing-pane"]);

const WORKSPACE_FOCUS_SCOPE_ATTRIBUTE = "data-workspace-focus-scope";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

type FocusScopeState = {
  lastFocusedByScope: Map<WorkspaceFocusScopeId, HTMLElement>;
  listener: ((event: FocusEvent) => void) | null;
  scopeRoots: Map<WorkspaceFocusScopeId, HTMLElement>;
};

const statesByHost = new WeakMap<WorkspaceHost, FocusScopeState>();

function getFocusScopeState(host: WorkspaceHost): FocusScopeState {
  const existing = statesByHost.get(host);
  if (existing) {
    return existing;
  }
  const state: FocusScopeState = {
    lastFocusedByScope: new Map(),
    listener: null,
    scopeRoots: new Map(),
  };
  statesByHost.set(host, state);
  registerWorkspaceHostCleanup(host, () => {
    if (state.listener) {
      document.removeEventListener("focusin", state.listener, true);
    }
    state.lastFocusedByScope.clear();
    state.scopeRoots.clear();
    state.listener = null;
    statesByHost.delete(host);
  });
  return state;
}

function isWorkspaceFocusScopeId(
  value: string,
): value is WorkspaceFocusScopeId {
  return WORKSPACE_FOCUS_SCOPE_IDS.includes(value as WorkspaceFocusScopeId);
}

function isWorkspaceFocusable(element: HTMLElement): boolean {
  return (
    element.matches(FOCUSABLE_SELECTOR) &&
    !element.hasAttribute("disabled") &&
    element.getAttribute("aria-hidden") !== "true" &&
    element.closest("[inert]") === null &&
    element.closest("[hidden]") === null
  );
}

export function getWorkspaceFocusableElements(
  root: HTMLElement,
): Array<HTMLElement> {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      isWorkspaceFocusable(element) &&
      !element.classList.contains("cm-content"),
  );
}

function getCanvasFocusableElements(
  host: WorkspaceHost,
  root: HTMLElement,
): Array<HTMLElement> {
  const sectionRoots = getSectionRefsStore(host).getState().withNested;
  const sectionFocusables = getOrderedTopLevelSectionIds(host).flatMap(
    (sectionId) => {
      const sectionRoot = sectionRoots[sectionId];
      return sectionRoot ? getWorkspaceFocusableElements(sectionRoot) : [];
    },
  );
  return sectionFocusables.length > 0
    ? sectionFocusables
    : getWorkspaceFocusableElements(root);
}

function getWorkspaceFocusScopeElements(
  host: WorkspaceHost,
  scopeId: WorkspaceFocusScopeId,
): Array<HTMLElement> {
  const root = getFocusScopeState(host).scopeRoots.get(scopeId);
  if (!root) {
    return [];
  }
  return scopeId === "canvas"
    ? getCanvasFocusableElements(host, root)
    : getWorkspaceFocusableElements(root);
}

function getStoredFocusableElement(
  host: WorkspaceHost,
  scopeId: WorkspaceFocusScopeId,
  root: HTMLElement,
): HTMLElement | null {
  const state = getFocusScopeState(host);
  const stored = state.lastFocusedByScope.get(scopeId);
  if (!stored) {
    return null;
  }

  if (
    !stored.isConnected ||
    !root.contains(stored) ||
    !isWorkspaceFocusable(stored)
  ) {
    state.lastFocusedByScope.delete(scopeId);
    return null;
  }
  return stored;
}

export function getWorkspaceFocusScopeId(
  element: HTMLElement,
): WorkspaceFocusScopeId | null {
  const scopeRoot = element.closest(`[${WORKSPACE_FOCUS_SCOPE_ATTRIBUTE}]`);
  const scopeId =
    scopeRoot?.getAttribute(WORKSPACE_FOCUS_SCOPE_ATTRIBUTE) ?? null;
  return scopeId !== null && isWorkspaceFocusScopeId(scopeId) ? scopeId : null;
}

function handleFocusIn(host: WorkspaceHost, event: FocusEvent): void {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) {
    return;
  }
  const scopeId = getWorkspaceFocusScopeId(target);
  if (!scopeId || !isWorkspaceFocusable(target)) {
    return;
  }
  const state = getFocusScopeState(host);
  if (!state.scopeRoots.get(scopeId)?.contains(target)) {
    return;
  }
  state.lastFocusedByScope.set(scopeId, target);
}

export function focusWorkspaceScope(
  host: WorkspaceHost,
  scopeId: WorkspaceFocusScopeId,
): boolean {
  const root = getFocusScopeState(host).scopeRoots.get(scopeId);
  if (!root) {
    return false;
  }
  const element =
    getStoredFocusableElement(host, scopeId, root) ??
    getWorkspaceFocusScopeElements(host, scopeId)[0] ??
    null;
  if (!element) {
    return false;
  }
  element.focus({ preventScroll: true });

  if (scopeId === "canvas") {
    movePaneToIncludeElement(host, element);
  }
  return true;
}

export function useWorkspaceFocusScope(
  scopeId: WorkspaceFocusScopeId,
  rootRef: RefObject<HTMLElement | null>,
): void {
  const host = useWorkspaceHost();
  useEffect(() => {
    const state = getFocusScopeState(host);
    const root = rootRef.current;
    if (!root) {
      throw new Error(`Workspace focus scope ${scopeId} root did not mount.`);
    }
    if (state.scopeRoots.has(scopeId)) {
      throw new Error(
        `Workspace focus scope ${scopeId} is already registered.`,
      );
    }
    root.setAttribute(WORKSPACE_FOCUS_SCOPE_ATTRIBUTE, scopeId);
    state.scopeRoots.set(scopeId, root);
    if (state.scopeRoots.size === 1) {
      state.listener = (event) => handleFocusIn(host, event);
      document.addEventListener("focusin", state.listener, true);
    }
    return () => {
      root.removeAttribute(WORKSPACE_FOCUS_SCOPE_ATTRIBUTE);
      state.scopeRoots.delete(scopeId);
      state.lastFocusedByScope.delete(scopeId);
      if (state.scopeRoots.size === 0 && state.listener) {
        document.removeEventListener("focusin", state.listener, true);
        state.listener = null;
      }
    };
  }, [host, rootRef, scopeId]);
}
