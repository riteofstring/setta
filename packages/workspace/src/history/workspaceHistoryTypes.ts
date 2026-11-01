import type { WorkspaceCapabilitiesState } from "../document/capabilities";
import type { WorkspaceDocument } from "../document/types";
import type { WorkspaceSnapshot } from "../document/workspaceSnapshot";
import type { WorkspaceHost } from "../workspaceHost";

export type WorkspaceHistoryChangeKind =
  | "section-create"
  | "section-delete"
  | "section-group"
  | "section-ungroup"
  | "section-move"
  | "section-resize"
  | "section-layout"
  | "section-presentation"
  | "item-create"
  | "item-delete"
  | "item-move"
  | "item-layout";

export type WorkspaceHistoryCapability = keyof WorkspaceCapabilitiesState;

export type WorkspaceHistoryTransaction = Readonly<{
  after: WorkspaceSnapshot<WorkspaceDocument>;
  before: WorkspaceSnapshot<WorkspaceDocument>;
  kind: WorkspaceHistoryChangeKind;
  requiredCapabilities: ReadonlyArray<WorkspaceHistoryCapability>;
}>;

export type WorkspaceHistorySynchronization = Readonly<{
  document: WorkspaceSnapshot<WorkspaceDocument>;
  source: "load" | "projection";
}>;

export type WorkspaceHistoryState = Readonly<{
  canRedo: boolean;
  canUndo: boolean;
  redoDisabledReason?: string | null;
  undoDisabledReason?: string | null;
}>;

export type WorkspaceHistoryEntry = Readonly<{
  redo: () => void;
  undo: () => void;
}>;

export type WorkspaceHistoryListener = (state: WorkspaceHistoryState) => void;

export type WorkspaceHistoryAuthority = Readonly<{
  dispose?: () => void;
  getState: () => WorkspaceHistoryState;
  record: (transaction: WorkspaceHistoryTransaction) => void;
  redo: () => void;
  subscribe: (listener: WorkspaceHistoryListener) => () => void;
  synchronize: (event: WorkspaceHistorySynchronization) => void;
  undo: () => void;
}>;

export type WorkspaceHostOptions = Readonly<{
  history?:
    | Readonly<{ kind: "local"; limit?: number }>
    | Readonly<{ authority: WorkspaceHistoryAuthority; kind: "delegated" }>;
}>;

export type WorkspaceHistoryDocumentAccess = Readonly<{
  getDocument: (host: WorkspaceHost) => WorkspaceDocument;
  replayDocument: (host: WorkspaceHost, document: WorkspaceDocument) => void;
}>;
