import type { WorkspaceHost } from "./workspaceHost";

type WorkspaceHostInternals = {
  cleanup: Set<() => void>;
  disposed: boolean;
  domId: string;
  elements: Set<HTMLElement>;
};

const internalsByHost = new WeakMap<WorkspaceHost, WorkspaceHostInternals>();
let nextWorkspaceHostDomId = 1;

export function initializeWorkspaceHost(host: WorkspaceHost): void {
  internalsByHost.set(host, {
    cleanup: new Set(),
    disposed: false,
    domId: `setta-workspace-${nextWorkspaceHostDomId++}`,
    elements: new Set(),
  });
}

export function assertWorkspaceHostActive(host: WorkspaceHost): void {
  const internals = internalsByHost.get(host);
  if (!internals) {
    throw new Error(
      "This workspace host was not created by createWorkspaceHost.",
    );
  }
  if (internals.disposed) {
    throw new Error("This workspace host has already been disposed.");
  }
}

export function registerWorkspaceHostCleanup(
  host: WorkspaceHost,
  cleanup: () => void,
): () => void {
  assertWorkspaceHostActive(host);
  const internals = internalsByHost.get(host);
  if (!internals) {
    throw new Error("This workspace host has no lifecycle state.");
  }
  internals.cleanup.add(cleanup);
  return () => internals.cleanup.delete(cleanup);
}

// DOM roots are an implementation detail of a live host, not a second way to resolve one. They
// let document-level browser events stay scoped to the workspace that owns their target, including
// portaled package chrome such as menus and tooltips.
export function registerWorkspaceHostElement(
  host: WorkspaceHost,
  element: HTMLElement,
): () => void {
  assertWorkspaceHostActive(host);
  const internals = internalsByHost.get(host);
  if (!internals) {
    throw new Error("This workspace host has no lifecycle state.");
  }
  internals.elements.add(element);
  return () => internals.elements.delete(element);
}

export function isWorkspaceHostElement(
  host: WorkspaceHost,
  target: EventTarget | null,
): boolean {
  const internals = internalsByHost.get(host);
  if (!internals || internals.disposed || !(target instanceof Node)) {
    return false;
  }
  return [...internals.elements].some((element) => element.contains(target));
}

export function getWorkspaceHostDomId(host: WorkspaceHost): string {
  assertWorkspaceHostActive(host);
  const internals = internalsByHost.get(host);
  if (!internals) {
    throw new Error("This workspace host has no lifecycle state.");
  }
  return internals.domId;
}

export function disposeWorkspaceHost(host: WorkspaceHost): void {
  const internals = internalsByHost.get(host);
  if (!internals || internals.disposed) {
    return;
  }
  internals.disposed = true;
  const cleanups = [...internals.cleanup];
  internals.cleanup.clear();
  for (const cleanup of cleanups.reverse()) {
    cleanup();
  }
  internals.elements.clear();
}
