import {
  disposeWorkspaceHost,
  initializeWorkspaceHost,
} from "./workspaceHostInternals";
import {
  getWorkspaceDocument,
  subscribeWorkspaceDocument,
  type WorkspaceDocumentSubscription,
} from "./document/documentChangeCallback";
import { loadWorkspaceDocument } from "./document/loadWorkspaceDocument";
import type { WorkspaceDocument, WorkspaceDocumentInput } from "./document/types";

// The public host is the single lifetime and document boundary for one workspace instance.
// Package actions that are not host methods take this value explicitly; no module can discover a
// current or default host.
export type WorkspaceHost = {
  dispose(): void;
  getSnapshot(): WorkspaceDocument;
  loadDocument(document: WorkspaceDocumentInput): void;
  subscribe(listener: WorkspaceDocumentSubscription): () => void;
};

export function createWorkspaceHost(): WorkspaceHost {
  let host: WorkspaceHost;
  host = {
    dispose: () => disposeWorkspaceHost(host),
    getSnapshot: () => getWorkspaceDocument(host),
    loadDocument: (document) => loadWorkspaceDocument(host, document),
    subscribe: (listener) => subscribeWorkspaceDocument(host, listener),
  };
  initializeWorkspaceHost(host);
  return host;
}
