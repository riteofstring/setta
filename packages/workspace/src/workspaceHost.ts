import {
  disposeWorkspaceHost,
  initializeWorkspaceHost,
} from "./workspaceHostInternals";
import { initializeWorkspaceHistory } from "./history/workspaceHistory";
import type { WorkspaceHostOptions } from "./history/workspaceHistoryTypes";
import {
  getWorkspaceDocument,
  subscribeWorkspaceDocument,
  type WorkspaceDocumentSubscription,
} from "./document/documentChangeCallback";
import {
  loadWorkspaceDocument,
  replayWorkspaceHistoryDocument,
} from "./document/loadWorkspaceDocument";
import type {
  WorkspaceDocument,
  WorkspaceDocumentInput,
} from "./document/types";

export type WorkspaceHost = {
  dispose(): void;
  getSnapshot(): WorkspaceDocument;
  loadDocument(document: WorkspaceDocumentInput): void;
  subscribe(listener: WorkspaceDocumentSubscription): () => void;
};

export type { WorkspaceHostOptions } from "./history/workspaceHistoryTypes";

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
