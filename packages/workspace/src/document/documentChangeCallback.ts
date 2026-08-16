import type { WorkspaceHost } from "../workspaceHost";
import {
  getActiveSectionsStore,
  getWorkspaceDocumentStore,
} from "./stores";
import type { WorkspaceDocument } from "./types";
import { registerWorkspaceHostCleanup } from "../workspaceHostInternals";

// The subscription half of the host document boundary. The reference pairs every canonical
// write with a backend route (per-flag routes, `moveSectionsWithBackend`, `setSectionSizes`,
// the debounced layout/viewport/active-ids sends); the package instead publishes one complete
// serializable snapshot to this host's subscribers after each canonical commit. Debouncing is
// transport policy and stays outside the package: the reference mirrors canonical state
// immediately and debounces only its network sends.

export type WorkspaceDocumentSubscription = (
  document: WorkspaceDocument,
) => void;

type DocumentChangeState = {
  notifying: boolean;
  subscribers: Set<WorkspaceDocumentSubscription>;
  suppressionDepth: number;
};

const changeStatesByHost = new WeakMap<WorkspaceHost, DocumentChangeState>();

function getDocumentChangeState(host: WorkspaceHost): DocumentChangeState {
  const existing = changeStatesByHost.get(host);
  if (existing) {
    return existing;
  }
  const state: DocumentChangeState = {
    notifying: false,
    subscribers: new Set(),
    suppressionDepth: 0,
  };
  changeStatesByHost.set(host, state);
  registerWorkspaceHostCleanup(host, () => {
    state.subscribers.clear();
    changeStatesByHost.delete(host);
  });
  return state;
}

// A serializable snapshot of the canonical workspace document. Store slices are shared, not
// cloned — treat the returned document as immutable. Reads go through the patched getState, so
// a snapshot taken during an atomic publication observes the staged state consistently.
export function getWorkspaceDocument(host: WorkspaceHost): WorkspaceDocument {
  const documentState = getWorkspaceDocumentStore(host).getState();
  return {
    sections: documentState.sections,
    topLevelSections: documentState.topLevelSections,
    viewport: documentState.viewport,
    activeIds: getActiveSectionsStore(host).getState().activeIds,
  };
}

export function subscribeWorkspaceDocument(
  host: WorkspaceHost,
  listener: WorkspaceDocumentSubscription,
): () => void {
  const state = getDocumentChangeState(host);
  state.subscribers.add(listener);
  return () => state.subscribers.delete(listener);
}

export function notifyWorkspaceDocumentSubscribers(host: WorkspaceHost): void {
  const state = getDocumentChangeState(host);
  const subscribers = [...state.subscribers];
  if (subscribers.length === 0) {
    return;
  }
  if (state.notifying) {
    throw new Error(
      "A workspace document subscription mutated the workspace synchronously. " +
        "Apply host reactions asynchronously to avoid a notification feedback loop.",
    );
  }
  const document = getWorkspaceDocument(host);
  state.notifying = true;
  try {
    for (const subscriber of subscribers) {
      subscriber(document);
    }
  } finally {
    state.notifying = false;
  }
}

// Host-initiated loads batch the internal mutations they perform and publish one final snapshot
// once the loaded document is complete.
export function runWithWorkspaceDocumentChangeNotificationsSuppressed(
  host: WorkspaceHost,
  fn: () => void,
): void {
  const state = getDocumentChangeState(host);
  state.suppressionDepth += 1;
  try {
    fn();
  } finally {
    state.suppressionDepth -= 1;
  }
}

export function notifyWorkspaceDocumentChange(host: WorkspaceHost): void {
  const state = getDocumentChangeState(host);
  if (state.suppressionDepth > 0) {
    return;
  }
  notifyWorkspaceDocumentSubscribers(host);
}
