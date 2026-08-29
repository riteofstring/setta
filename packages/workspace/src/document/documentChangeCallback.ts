import type { WorkspaceHost } from "../workspaceHost";
import { getActiveSectionsStore, getWorkspaceDocumentStore } from "./stores";
import type { WorkspaceDocument } from "./types";
import { registerWorkspaceHostCleanup } from "../workspaceHostInternals";

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
