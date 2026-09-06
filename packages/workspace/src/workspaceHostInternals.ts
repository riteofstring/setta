import type { WorkspaceHost } from "./workspaceHost";

type WorkspaceHostInternals = {
  cleanup: Set<() => void>;
  disposed: boolean;
  domId: string;
  elements: Set<HTMLElement>;
};

const internalsByHost = new WeakMap<WorkspaceHost, WorkspaceHostInternals>();
const hostByRegisteredElement = new WeakMap<HTMLElement, WorkspaceHost>();
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

export function isWorkspaceHostActive(host: WorkspaceHost): boolean {
  const internals = internalsByHost.get(host);
  return internals !== undefined && !internals.disposed;
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
  hostByRegisteredElement.set(element, host);
  return () => {
    internals.elements.delete(element);
    if (hostByRegisteredElement.get(element) === host) {
      hostByRegisteredElement.delete(element);
    }
  };
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

export function getWorkspaceHostForElement(
  target: EventTarget | null,
): WorkspaceHost | null {
  let current = target instanceof Node ? target : null;
  while (current) {
    if (current instanceof HTMLElement) {
      const host = hostByRegisteredElement.get(current);
      if (host && isWorkspaceHostActive(host)) {
        return host;
      }
    }
    current =
      current.parentNode ??
      (current instanceof ShadowRoot ? current.host : null);
  }
  return null;
}

export function getWorkspaceHostElements(
  host: WorkspaceHost,
): ReadonlyArray<HTMLElement> {
  assertWorkspaceHostActive(host);
  const internals = internalsByHost.get(host);
  if (!internals) {
    throw new Error("This workspace host has no lifecycle state.");
  }
  return [...internals.elements];
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
  for (const element of internals.elements) {
    if (hostByRegisteredElement.get(element) === host) {
      hostByRegisteredElement.delete(element);
    }
  }
  internals.elements.clear();
}
