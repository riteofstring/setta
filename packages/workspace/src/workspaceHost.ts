import {
  disposeWorkspaceHost,
  initializeWorkspaceHost,
} from "./workspaceHostInternals.js";
import { initializeWorkspaceHistory } from "./history/workspaceHistory.js";
import type { WorkspaceHostOptions } from "./history/workspaceHistoryTypes.js";
import {
  getWorkspaceDocument,
  subscribeWorkspaceDocument,
  type WorkspaceDocumentSubscription,
} from "./document/documentChangeCallback.js";
import {
  loadWorkspaceDocument,
  replayWorkspaceHistoryDocument,
} from "./document/loadWorkspaceDocument.js";
import type {
  WorkspaceDocument,
  WorkspaceDocumentInput,
} from "./document/types.js";

export type WorkspaceHost = {
  dispose(): void;
  getSnapshot(): WorkspaceDocument;
  loadDocument(document: WorkspaceDocumentInput): void;
  subscribe(listener: WorkspaceDocumentSubscription): () => void;
};

export type { WorkspaceHostOptions } from "./history/workspaceHistoryTypes.js";

export function createWorkspaceHost(
  options: WorkspaceHostOptions = {},
): WorkspaceHost {
  let host: WorkspaceHost;
  host = {
    dispose: () => disposeWorkspaceHost(host),
    getSnapshot: () => getWorkspaceDocument(host),
    loadDocument: (document) => loadWorkspaceDocument(host, document),
    subscribe: (listener) => subscribeWorkspaceDocument(host, listener),
  };
  initializeWorkspaceHost(host);
  initializeWorkspaceHistory(host, options.history, {
    getDocument: getWorkspaceDocument,
    replayDocument: replayWorkspaceHistoryDocument,
  });
  return host;
}
