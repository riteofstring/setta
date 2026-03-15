import { useEffect, type RefObject } from "react";
import {
  FOCUSABLE_SELECTOR,
  isFocusableElement,
  normalizeFocusableElement,
} from "./focusManagerElements";

export type TabScopeBehavior = "default" | "canvas";

export type TabScopeRegistration = {
  scopeId: string;
  order: number;
  rootRef: RefObject<HTMLElement>;
  behavior?: TabScopeBehavior;
};

const tabScopes = new Map<string, TabScopeRegistration>();
const lastFocusedByScope = new Map<string, HTMLElement>();
let focusTrackingInitialized = false;

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

export function getOrderedScopes(): TabScopeRegistration[] {
  return Array.from(tabScopes.values())
    .filter((scope) => scope.rootRef.current)
    .sort((a, b) => a.order - b.order);
}

export function getScopeForElement(
  element: HTMLElement,
): TabScopeRegistration | null {
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

export function getStoredFocusedElement(
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
  if (!(nearest instanceof HTMLElement) || !isFocusableElement(nearest)) {
    return;
  }
  lastFocusedByScope.set(scope.scopeId, normalizeFocusableElement(nearest));
}
