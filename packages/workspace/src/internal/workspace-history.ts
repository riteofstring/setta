import type { WorkspaceDocument } from "./workspace-document-contract.js";
import type { WorkspaceCapabilities } from "./workspace-policy.js";
import type {
  WorkspaceActionRejectionReason,
  WorkspaceDocumentChange,
  WorkspaceDocumentChangeReason,
  WorkspaceHistoryState,
} from "./workspace-surface-contract.js";

type WorkspaceHistoryDirection = "redo" | "undo";

type WorkspaceHistoryEntry<TSectionData> = Readonly<{
  after: WorkspaceDocument<TSectionData>;
  afterSelection: readonly string[];
  before: WorkspaceDocument<TSectionData>;
  beforeSelection: readonly string[];
  reason: WorkspaceDocumentChangeReason;
}>;

type WorkspaceHistoryRecord<TSectionData> = Readonly<{
  after: WorkspaceDocument<TSectionData>;
  before: WorkspaceDocument<TSectionData>;
  beforeSelection: readonly string[];
  reason: WorkspaceDocumentChangeReason;
  sourceSignature: string;
  targetSignature: string;
}>;

type PendingHistoryRecordBatch<TSectionData> = Readonly<{
  records: readonly WorkspaceHistoryRecord<TSectionData>[];
  sourceSignature: string;
  targetSignature: string;
  type: "record";
}>;

type PendingHistoryNavigation<TSectionData> = Readonly<{
  direction: WorkspaceHistoryDirection;
  entry: WorkspaceHistoryEntry<TSectionData>;
  sourceSignature: string;
  targetSelection: readonly string[];
  targetSignature: string;
  type: "navigation";
}>;

type PendingHistoryChange<TSectionData> =
  PendingHistoryNavigation<TSectionData> | PendingHistoryRecordBatch<TSectionData>;

export type WorkspaceHistoryNavigationPlan<TSectionData> =
  | Readonly<{
      change: WorkspaceDocumentChange;
      document: WorkspaceDocument<TSectionData>;
      status: "applied";
    }>
  | Readonly<{
      reason: WorkspaceActionRejectionReason;
      status: "rejected";
    }>
  | Readonly<{ status: "unchanged" }>;

export type WorkspaceHistorySynchronization = Readonly<{
  direction: WorkspaceHistoryDirection | null;
  navigationAccepted: boolean;
  navigationRejected: boolean;
  selection: readonly string[] | null;
  stateChanged: boolean;
}>;

type WorkspaceEditableCapability = keyof WorkspaceCapabilities;

const capabilityRejections: Readonly<
  Record<WorkspaceEditableCapability, WorkspaceActionRejectionReason>
> = {
  editLayout: "layout-edit-disabled",
  editPresentation: "presentation-edit-disabled",
  editStructure: "structure-edit-disabled",
};

const historyRequirements: Partial<
  Record<WorkspaceDocumentChangeReason, readonly WorkspaceEditableCapability[]>
> = {
  "section-create": ["editStructure"],
  "section-delete": ["editStructure"],
  "section-group": ["editStructure", "editLayout"],
  "section-lock": ["editLayout"],
  "section-minimize": ["editPresentation"],
  "section-move": ["editLayout"],
  "section-orientation": ["editLayout"],
  "section-overflow": ["editLayout"],
  "section-paste": ["editStructure"],
  "section-presentation": ["editPresentation"],
  "section-resize": ["editLayout"],
  "section-size-mode": ["editLayout"],
  "section-stack": ["editLayout"],
  "section-title": ["editPresentation"],
  "section-ungroup": ["editStructure", "editLayout"],
};

function stableValueSignature(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableValueSignature(item)).join(",")}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableValueSignature(record[key])}`)
    .join(",")}}`;
}

function historyDocumentSignature(document: WorkspaceDocument<unknown>): string {
  return stableValueSignature({
    rootSections: document.rootSections,
    sections: document.sections,
  });
}

function historicalDocument<TSectionData>(
  snapshot: WorkspaceDocument<TSectionData>,
  current: WorkspaceDocument<TSectionData>,
): WorkspaceDocument<TSectionData> {
  return { ...snapshot, viewport: current.viewport };
}

function capabilityRejection(
  reason: WorkspaceDocumentChangeReason,
  capabilities: WorkspaceCapabilities,
): WorkspaceActionRejectionReason | null {
  const unavailable = historyRequirements[reason]?.find((capability) => !capabilities[capability]);
  return unavailable ? capabilityRejections[unavailable] : null;
}

function emptySynchronization(): WorkspaceHistorySynchronization {
  return {
    direction: null,
    navigationAccepted: false,
    navigationRejected: false,
    selection: null,
    stateChanged: false,
  };
}

function isRecordedChange(reason: WorkspaceDocumentChangeReason): boolean {
  return reason !== "history-redo" && reason !== "history-undo" && reason !== "viewport";
}

export class WorkspaceDocumentHistory<TSectionData> {
  readonly #future: WorkspaceHistoryEntry<TSectionData>[] = [];
  #observedSignature: string;
  readonly #past: WorkspaceHistoryEntry<TSectionData>[] = [];
  #pending: PendingHistoryChange<TSectionData> | null = null;

  constructor(document: WorkspaceDocument<TSectionData>) {
    this.#observedSignature = historyDocumentSignature(document);
  }

  state(capabilities: WorkspaceCapabilities): WorkspaceHistoryState {
    if (this.#pending) {
      return { canRedo: false, canUndo: false };
    }
    const redoEntry = this.#future.at(-1);
    const undoEntry = this.#past.at(-1);
    return {
      canRedo: Boolean(redoEntry && !capabilityRejection(redoEntry.reason, capabilities)),
      canUndo: Boolean(undoEntry && !capabilityRejection(undoEntry.reason, capabilities)),
    };
  }

  stageCommit(
    before: WorkspaceDocument<TSectionData>,
    after: WorkspaceDocument<TSectionData>,
    change: WorkspaceDocumentChange,
    selection: readonly string[],
  ): boolean {
    if (!isRecordedChange(change.reason)) {
      return false;
    }
    const record: WorkspaceHistoryRecord<TSectionData> = {
      after,
      before,
      beforeSelection: [...selection],
      reason: change.reason,
      sourceSignature: historyDocumentSignature(before),
      targetSignature: historyDocumentSignature(after),
    };
    const pending = this.#pending;
    this.#pending =
      pending?.type === "record" && pending.targetSignature === record.sourceSignature
        ? {
            records: [...pending.records, record],
            sourceSignature: pending.sourceSignature,
            targetSignature: record.targetSignature,
            type: "record",
          }
        : {
            records: [record],
            sourceSignature: record.sourceSignature,
            targetSignature: record.targetSignature,
            type: "record",
          };
    return true;
  }

  navigate(
    direction: WorkspaceHistoryDirection,
    document: WorkspaceDocument<TSectionData>,
    capabilities: WorkspaceCapabilities,
  ): WorkspaceHistoryNavigationPlan<TSectionData> {
    if (this.#pending) {
      return { status: "unchanged" };
    }
    const entry = (direction === "undo" ? this.#past : this.#future).at(-1);
    if (!entry) {
      return { status: "unchanged" };
    }
    const rejection = capabilityRejection(entry.reason, capabilities);
    if (rejection) {
      return { reason: rejection, status: "rejected" };
    }
    const snapshot = direction === "undo" ? entry.before : entry.after;
    const targetSelection = direction === "undo" ? entry.beforeSelection : entry.afterSelection;
    const target = historicalDocument(snapshot, document);
    this.#pending = {
      direction,
      entry,
      sourceSignature: historyDocumentSignature(document),
      targetSelection,
      targetSignature: historyDocumentSignature(target),
      type: "navigation",
    };
    return {
      change: { reason: direction === "undo" ? "history-undo" : "history-redo" },
      document: target,
      status: "applied",
    };
  }

  synchronize(
    document: WorkspaceDocument<TSectionData>,
    selection: readonly string[],
    controlled: boolean,
  ): WorkspaceHistorySynchronization {
    const signature = historyDocumentSignature(document);
    const pending = this.#pending;
    if (!pending) {
      return this.#synchronizeExternalDocument(signature);
    }
    if (signature === pending.targetSignature) {
      return this.#acceptPending(pending, selection, signature);
    }
    if (controlled || signature !== pending.sourceSignature) {
      return this.#rejectPending(pending, signature);
    }
    return emptySynchronization();
  }

  #acceptNavigation(
    pending: PendingHistoryNavigation<TSectionData>,
    signature: string,
  ): WorkspaceHistorySynchronization {
    const source = pending.direction === "undo" ? this.#past : this.#future;
    const destination = pending.direction === "undo" ? this.#future : this.#past;
    if (source.at(-1) !== pending.entry) {
      throw new Error("Workspace history changed before navigation was accepted.");
    }
    source.pop();
    destination.push(pending.entry);
    this.#observedSignature = signature;
    this.#pending = null;
    return {
      direction: pending.direction,
      navigationAccepted: true,
      navigationRejected: false,
      selection: [...pending.targetSelection],
      stateChanged: true,
    };
  }

  #acceptPending(
    pending: PendingHistoryChange<TSectionData>,
    selection: readonly string[],
    signature: string,
  ): WorkspaceHistorySynchronization {
    if (pending.type === "navigation") {
      return this.#acceptNavigation(pending, signature);
    }
    pending.records.forEach((record, index) => {
      this.#past.push({
        after: record.after,
        afterSelection: [...(pending.records[index + 1]?.beforeSelection ?? selection)],
        before: record.before,
        beforeSelection: record.beforeSelection,
        reason: record.reason,
      });
    });
    this.#future.length = 0;
    this.#observedSignature = signature;
    this.#pending = null;
    return { ...emptySynchronization(), stateChanged: true };
  }

  #rejectPending(
    pending: PendingHistoryChange<TSectionData>,
    signature: string,
  ): WorkspaceHistorySynchronization {
    const diverged = signature !== pending.sourceSignature;
    if (diverged) {
      this.#past.length = 0;
      this.#future.length = 0;
    }
    this.#observedSignature = signature;
    this.#pending = null;
    return {
      direction: pending.type === "navigation" ? pending.direction : null,
      navigationAccepted: false,
      navigationRejected: pending.type === "navigation",
      selection: null,
      stateChanged: true,
    };
  }

  #synchronizeExternalDocument(signature: string): WorkspaceHistorySynchronization {
    if (signature === this.#observedSignature) {
      return emptySynchronization();
    }
    const stateChanged = this.#past.length > 0 || this.#future.length > 0;
    this.#past.length = 0;
    this.#future.length = 0;
    this.#observedSignature = signature;
    return { ...emptySynchronization(), stateChanged };
  }
}

export function resolveWorkspaceHistoryShortcut(
  event: Readonly<{
    altKey: boolean;
    ctrlKey: boolean;
    key: string;
    metaKey: boolean;
    shiftKey: boolean;
  }>,
): WorkspaceHistoryDirection | null {
  if (event.altKey || (!event.ctrlKey && !event.metaKey)) {
    return null;
  }
  const key = event.key.toLowerCase();
  if (key === "y" && !event.shiftKey) {
    return "redo";
  }
  if (key !== "z") {
    return null;
  }
  return event.shiftKey ? "redo" : "undo";
}
