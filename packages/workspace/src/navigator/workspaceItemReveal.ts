import { useCallback, useEffect, useRef } from "react";
import { getSectionItemVisibility } from "../items/itemListRegistry.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import type { WorkspaceHost } from "../workspaceHost.js";
import {
  assertWorkspaceHostActive,
  registerWorkspaceHostCleanup,
} from "../workspaceHostInternals.js";

const WORKSPACE_ITEM_REVEAL_EMPHASIS_DURATION_MS = 1_500;

type WorkspaceItemRevealRegistry = {
  emphasisTimeouts: Map<HTMLElement, ReturnType<typeof setTimeout>>;
  targetsBySection: Map<string, Map<string, Set<HTMLElement>>>;
};

type WorkspaceItemRevealAvailability =
  | Readonly<{ canReveal: true; statusMessage: null }>
  | Readonly<{ canReveal: false; statusMessage: string }>;

type WorkspaceItemRevealResult =
  | Readonly<{ revealed: true; statusMessage: null }>
  | Readonly<{ revealed: false; statusMessage: string }>;

const registriesByHost = new WeakMap<
  WorkspaceHost,
  WorkspaceItemRevealRegistry
>();

function getWorkspaceItemRevealRegistry(
  host: WorkspaceHost,
): WorkspaceItemRevealRegistry {
  assertWorkspaceHostActive(host);
  const existing = registriesByHost.get(host);
  if (existing) {
    return existing;
  }
  const registry: WorkspaceItemRevealRegistry = {
    emphasisTimeouts: new Map(),
    targetsBySection: new Map(),
  };
  registriesByHost.set(host, registry);
  registerWorkspaceHostCleanup(host, () => {
    for (const [element, timeout] of registry.emphasisTimeouts) {
      clearTimeout(timeout);
      element.removeAttribute("data-setta-workspace-item-reveal");
    }
    registry.emphasisTimeouts.clear();
    registry.targetsBySection.clear();
    registriesByHost.delete(host);
  });
  return registry;
}

function getRegisteredWorkspaceItemRevealTarget(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
): HTMLElement | null {
  assertWorkspaceHostActive(host);
  const targets = registriesByHost
    .get(host)
    ?.targetsBySection.get(sectionId)
    ?.get(itemId);
  if (!targets) {
    return null;
  }
  for (const element of targets) {
    if (element.isConnected) {
      return element;
    }
    targets.delete(element);
  }
  return null;
}

function clearWorkspaceItemRevealEmphasis(
  registry: WorkspaceItemRevealRegistry,
  element: HTMLElement,
): void {
  const timeout = registry.emphasisTimeouts.get(element);
  if (timeout !== undefined) {
    clearTimeout(timeout);
    registry.emphasisTimeouts.delete(element);
  }
  element.removeAttribute("data-setta-workspace-item-reveal");
}

function applyWorkspaceItemRevealEmphasis(
  host: WorkspaceHost,
  element: HTMLElement,
): void {
  const registry = getWorkspaceItemRevealRegistry(host);
  clearWorkspaceItemRevealEmphasis(registry, element);
  element.setAttribute("data-setta-workspace-item-reveal", "true");
  const timeout = setTimeout(() => {
    if (registry.emphasisTimeouts.get(element) === timeout) {
      registry.emphasisTimeouts.delete(element);
      element.removeAttribute("data-setta-workspace-item-reveal");
    }
  }, WORKSPACE_ITEM_REVEAL_EMPHASIS_DURATION_MS);
  registry.emphasisTimeouts.set(element, timeout);
}

function getWorkspaceItemRevealUnavailableMessage(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
): string {
  const visibility = getSectionItemVisibility(host, sectionId);
  if (visibility?.filterActive && !visibility.visibleItemIds.has(itemId)) {
    return "This item is hidden by the section filter.";
  }
  return "This item is not mounted in this workspace view.";
}

export function registerWorkspaceItemRevealTarget(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
  element: HTMLElement,
): () => void {
  const registry = getWorkspaceItemRevealRegistry(host);
  const targetsByItem = registry.targetsBySection.get(sectionId) ?? new Map();
  const targets = targetsByItem.get(itemId) ?? new Set<HTMLElement>();
  targets.add(element);
  targetsByItem.set(itemId, targets);
  registry.targetsBySection.set(sectionId, targetsByItem);

  return () => {
    const currentRegistry = registriesByHost.get(host);
    const currentTargets = currentRegistry?.targetsBySection
      .get(sectionId)
      ?.get(itemId);
    if (!currentRegistry || !currentTargets) {
      return;
    }
    currentTargets.delete(element);
    clearWorkspaceItemRevealEmphasis(currentRegistry, element);
    if (currentTargets.size > 0) {
      return;
    }
    const currentTargetsByItem =
      currentRegistry.targetsBySection.get(sectionId);
    currentTargetsByItem?.delete(itemId);
    if (currentTargetsByItem?.size === 0) {
      currentRegistry.targetsBySection.delete(sectionId);
    }
  };
}

export function getWorkspaceItemRevealAvailability(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
): WorkspaceItemRevealAvailability {
  if (getRegisteredWorkspaceItemRevealTarget(host, sectionId, itemId)) {
    return { canReveal: true, statusMessage: null };
  }
  return {
    canReveal: false,
    statusMessage: getWorkspaceItemRevealUnavailableMessage(
      host,
      sectionId,
      itemId,
    ),
  };
}

export function revealWorkspaceItem(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
): WorkspaceItemRevealResult {
  const element = getRegisteredWorkspaceItemRevealTarget(
    host,
    sectionId,
    itemId,
  );
  if (!element) {
    return {
      revealed: false,
      statusMessage: getWorkspaceItemRevealUnavailableMessage(
        host,
        sectionId,
        itemId,
      ),
    };
  }
  if (typeof element.scrollIntoView === "function") {
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  element.focus({ preventScroll: true });
  applyWorkspaceItemRevealEmphasis(host, element);
  return { revealed: true, statusMessage: null };
}

export function useWorkspaceItemRevealTarget(
  sectionId: string,
  itemId: string,
): (element: HTMLDivElement | null) => void {
  const host = useWorkspaceHost();
  const unregisterRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      unregisterRef.current?.();
      unregisterRef.current = null;
    },
    [],
  );

  return useCallback(
    (element: HTMLDivElement | null) => {
      unregisterRef.current?.();
      unregisterRef.current = null;
      if (element) {
        unregisterRef.current = registerWorkspaceItemRevealTarget(
          host,
          sectionId,
          itemId,
          element,
        );
      }
    },
    [host, itemId, sectionId],
  );
}
