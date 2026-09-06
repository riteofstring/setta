import { useSyncExternalStore } from "react";
import _ from "lodash";
import { getWorkspaceCapabilitiesStore } from "../document/capabilities";
import {
  cloneFrozenWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from "../document/workspaceSnapshot";
import type { WorkspaceDocument } from "../document/types";
import { getSectionRefsStore } from "../section/sectionRefs";
import { useWorkspaceHost } from "../workspaceHostContext";
import {
  assertWorkspaceHostActive,
  getWorkspaceHostElements,
  registerWorkspaceHostCleanup,
} from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";
import type {
  WorkspaceHistoryAuthority,
  WorkspaceHistoryCapability,
  WorkspaceHistoryChangeKind,
  WorkspaceHistoryDocumentAccess,
  WorkspaceHistoryListener,
  WorkspaceHistoryState,
  WorkspaceHistorySynchronization,
  WorkspaceHistoryTransaction,
  WorkspaceHostOptions,
} from "./workspaceHistoryTypes";
import { createWorkspaceHistoryReplayDocument } from "./workspaceHistoryReplay";

declare const workspaceHistoryBatchToken: unique symbol;

export type WorkspaceHistoryBatch = Readonly<{
  [workspaceHistoryBatchToken]: never;
}>;

type ResolvedWorkspaceHistoryState = Readonly<{
  canRedo: boolean;
  canUndo: boolean;
  redoDisabledReason: string | null;
  undoDisabledReason: string | null;
}>;

type LocalHistoryRuntime = {
  future: Array<WorkspaceHistoryTransaction>;
  kind: "local";
  limit: number;
  past: Array<WorkspaceHistoryTransaction>;
};

type DelegatedHistoryRuntime = {
  authority: WorkspaceHistoryAuthority;
  kind: "delegated";
  unsubscribeAuthority: (() => void) | null;
};

type WorkspaceHistoryRuntime = (
  LocalHistoryRuntime | DelegatedHistoryRuntime
) & {
  access: WorkspaceHistoryDocumentAccess;
  disposed: boolean;
  focusFrames: Set<number>;
  listeners: Set<WorkspaceHistoryListener>;
  observedDocument: WorkspaceSnapshot<WorkspaceDocument>;
  replayDepth: number;
  state: ResolvedWorkspaceHistoryState;
  unsubscribeCapabilities: () => void;
};

type ActiveWorkspaceHistoryBatch = {
  before: WorkspaceSnapshot<WorkspaceDocument> | null;
  kind: WorkspaceHistoryChangeKind;
  token: WorkspaceHistoryBatch;
};

type WorkspaceHistoryBatchState = {
  active: ActiveWorkspaceHistoryBatch | null;
};

type LocalWorkspaceHistoryReplay = {
  destination: Array<WorkspaceHistoryTransaction>;
  source: Array<WorkspaceHistoryTransaction>;
  sourceDocument: WorkspaceSnapshot<WorkspaceDocument>;
  target: WorkspaceSnapshot<WorkspaceDocument>;
  transaction: WorkspaceHistoryTransaction;
};

const DEFAULT_HISTORY_LIMIT = 100;

const HISTORY_DISABLED_STATE: ResolvedWorkspaceHistoryState = Object.freeze({
  canRedo: false,
  canUndo: false,
  redoDisabledReason: "History is disabled for this workspace.",
  undoDisabledReason: "History is disabled for this workspace.",
});

const HISTORY_EDIT_IN_PROGRESS_STATE: ResolvedWorkspaceHistoryState =
  Object.freeze({
    canRedo: false,
    canUndo: false,
    redoDisabledReason:
      "Redo is unavailable while a workspace edit is in progress.",
    undoDisabledReason:
      "Undo is unavailable while a workspace edit is in progress.",
  });

const HISTORY_CHANGE_KINDS = new Set<WorkspaceHistoryChangeKind>([
  "section-create",
  "section-delete",
  "section-group",
  "section-ungroup",
  "section-move",
  "section-resize",
  "section-layout",
  "section-presentation",
  "item-create",
  "item-delete",
  "item-move",
  "item-layout",
]);

const STRUCTURE_CAPABILITIES: ReadonlyArray<WorkspaceHistoryCapability> =
  Object.freeze(["canEditStructure"]);
const LAYOUT_CAPABILITIES: ReadonlyArray<WorkspaceHistoryCapability> =
  Object.freeze(["canEditLayout"]);
const STRUCTURE_AND_LAYOUT_CAPABILITIES: ReadonlyArray<WorkspaceHistoryCapability> =
  Object.freeze(["canEditStructure", "canEditLayout"]);
const REQUIRED_CAPABILITIES_BY_KIND = Object.freeze({
  "item-create": STRUCTURE_CAPABILITIES,
  "item-delete": STRUCTURE_CAPABILITIES,
  "item-layout": LAYOUT_CAPABILITIES,
  "item-move": STRUCTURE_CAPABILITIES,
  "section-create": STRUCTURE_CAPABILITIES,
  "section-delete": STRUCTURE_CAPABILITIES,
  "section-group": STRUCTURE_AND_LAYOUT_CAPABILITIES,
  "section-layout": LAYOUT_CAPABILITIES,
  "section-presentation": LAYOUT_CAPABILITIES,
  "section-resize": LAYOUT_CAPABILITIES,
  "section-ungroup": STRUCTURE_AND_LAYOUT_CAPABILITIES,
} satisfies Record<
  Exclude<WorkspaceHistoryChangeKind, "section-move">,
  ReadonlyArray<WorkspaceHistoryCapability>
>);

const runtimeByHost = new WeakMap<WorkspaceHost, WorkspaceHistoryRuntime>();
const batchStateByHost = new WeakMap<
  WorkspaceHost,
  WorkspaceHistoryBatchState
>();

function createResolvedHistoryState({
  canRedo,
  canUndo,
  redoDisabledReason,
  undoDisabledReason,
}: {
  canRedo: boolean;
  canUndo: boolean;
  redoDisabledReason: string | null;
  undoDisabledReason: string | null;
}): ResolvedWorkspaceHistoryState {
  return Object.freeze({
    canRedo,
    canUndo,
    redoDisabledReason,
    undoDisabledReason,
  });
}

function hasSameHistoryState(
  left: ResolvedWorkspaceHistoryState,
  right: ResolvedWorkspaceHistoryState,
): boolean {
  return (
    left.canRedo === right.canRedo &&
    left.canUndo === right.canUndo &&
    left.redoDisabledReason === right.redoDisabledReason &&
    left.undoDisabledReason === right.undoDisabledReason
  );
}

function assertWorkspaceHistoryChangeKind(
  kind: WorkspaceHistoryChangeKind,
): void {
  if (!HISTORY_CHANGE_KINDS.has(kind)) {
    throw new Error(`Unknown workspace history change kind ${String(kind)}.`);
  }
}

function assertWorkspaceHistoryAuthority(
  authority: unknown,
): asserts authority is WorkspaceHistoryAuthority {
  if (authority === null || typeof authority !== "object") {
    throw new Error(
      "Delegated workspace history requires an authority object.",
    );
  }
  const candidate = authority as Record<string, unknown>;
  for (const method of [
    "getState",
    "record",
    "redo",
    "subscribe",
    "synchronize",
    "undo",
  ]) {
    if (typeof candidate[method] !== "function") {
      throw new Error(
        `Delegated workspace history authority requires ${method}().`,
      );
    }
  }
  if (
    candidate["dispose"] !== undefined &&
    typeof candidate["dispose"] !== "function"
  ) {
    throw new Error(
      "Delegated workspace history authority dispose must be a function.",
    );
  }
}

function assertWorkspaceHistoryOptions(
  options: WorkspaceHostOptions["history"],
): void {
  if (options === null || typeof options !== "object") {
    throw new Error("Workspace history configuration must be an object.");
  }
  const kind = options.kind;
  if (kind === "local") {
    if (options.limit !== undefined) {
      assertHistoryLimit(options.limit);
    }
    return;
  }
  if (kind === "delegated") {
    assertWorkspaceHistoryAuthority(options.authority);
    return;
  }
  throw new Error(
    `Workspace history configuration has unknown kind ${String(kind)}.`,
  );
}

function assertHistoryLimit(limit: unknown): asserts limit is number {
  if (
    typeof limit !== "number" ||
    !Number.isFinite(limit) ||
    !Number.isInteger(limit) ||
    limit <= 0
  ) {
    throw new Error(
      "Workspace local history limit must be a positive finite integer.",
    );
  }
}

function getBatchState(host: WorkspaceHost): WorkspaceHistoryBatchState {
  const existing = batchStateByHost.get(host);
  if (existing) {
    return existing;
  }
  const state: WorkspaceHistoryBatchState = { active: null };
  batchStateByHost.set(host, state);
  registerWorkspaceHostCleanup(host, () => {
    state.active = null;
    batchStateByHost.delete(host);
  });
  return state;
}

function getCapabilityDisabledReason(
  host: WorkspaceHost,
  direction: "redo" | "undo",
  requiredCapabilities: ReadonlyArray<WorkspaceHistoryCapability>,
): string | null {
  const capabilities = getWorkspaceCapabilitiesStore(host).getState();
  const missing = requiredCapabilities.filter(
    (capability) => !capabilities[capability],
  );
  if (missing.length === 0) {
    return null;
  }
  const operation = direction === "undo" ? "Undo" : "Redo";
  if (missing.length === 2) {
    return `${operation} requires permission to edit workspace structure and layout.`;
  }
  return missing[0] === "canEditStructure"
    ? `${operation} requires permission to edit workspace structure.`
    : `${operation} requires permission to edit workspace layout.`;
}

function getLocalHistoryState(
  host: WorkspaceHost,
  runtime: WorkspaceHistoryRuntime & LocalHistoryRuntime,
): ResolvedWorkspaceHistoryState {
  const undoTransaction = runtime.past.at(-1) ?? null;
  const redoTransaction = runtime.future.at(-1) ?? null;
  const undoDisabledReason = undoTransaction
    ? getCapabilityDisabledReason(
        host,
        "undo",
        undoTransaction.requiredCapabilities,
      )
    : "There is nothing to undo.";
  const redoDisabledReason = redoTransaction
    ? getCapabilityDisabledReason(
        host,
        "redo",
        redoTransaction.requiredCapabilities,
      )
    : "There is nothing to redo.";
  return createResolvedHistoryState({
    canRedo: redoDisabledReason === null,
    canUndo: undoDisabledReason === null,
    redoDisabledReason,
    undoDisabledReason,
  });
}

function getDelegatedHistoryState(
  runtime: WorkspaceHistoryRuntime & DelegatedHistoryRuntime,
): ResolvedWorkspaceHistoryState {
  const state = runtime.authority.getState();
  assertDelegatedHistoryState(state);
  return createResolvedHistoryState({
    canRedo: state.canRedo,
    canUndo: state.canUndo,
    redoDisabledReason: state.canRedo
      ? null
      : normalizeDelegatedDisabledReason(
          state.redoDisabledReason,
          "Redo is unavailable from the delegated history authority.",
        ),
    undoDisabledReason: state.canUndo
      ? null
      : normalizeDelegatedDisabledReason(
          state.undoDisabledReason,
          "Undo is unavailable from the delegated history authority.",
        ),
  });
}

function assertDelegatedHistoryState(
  state: unknown,
): asserts state is WorkspaceHistoryState {
  const candidate = getDelegatedHistoryStateRecord(state);
  assertDelegatedHistoryBoolean(candidate["canUndo"], "canUndo");
  assertDelegatedHistoryBoolean(candidate["canRedo"], "canRedo");
  assertDelegatedDisabledReason(
    candidate["undoDisabledReason"],
    "undoDisabledReason",
  );
  assertDelegatedDisabledReason(
    candidate["redoDisabledReason"],
    "redoDisabledReason",
  );
}

function getDelegatedHistoryStateRecord(
  state: unknown,
): Record<string, unknown> {
  if (state === null || typeof state !== "object") {
    throw new Error(
      "Delegated workspace history authority returned an invalid state.",
    );
  }
  return state as Record<string, unknown>;
}

function assertDelegatedHistoryBoolean(
  value: unknown,
  name: "canRedo" | "canUndo",
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new Error(
      `Delegated workspace history authority state requires boolean ${name}.`,
    );
  }
}

function assertDelegatedDisabledReason(
  value: unknown,
  name: "redoDisabledReason" | "undoDisabledReason",
): asserts value is string | null | undefined {
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new Error(
      `Delegated workspace history authority ${name} must be a string or null.`,
    );
  }
}

function normalizeDelegatedDisabledReason(
  reason: string | null | undefined,
  fallback: string,
): string {
  return reason?.trim() || fallback;
}

function readRuntimeHistoryState(
  host: WorkspaceHost,
  runtime: WorkspaceHistoryRuntime,
): ResolvedWorkspaceHistoryState {
  const next = batchStateByHost.get(host)?.active
    ? HISTORY_EDIT_IN_PROGRESS_STATE
    : runtime.kind === "local"
      ? getLocalHistoryState(host, runtime)
      : getDelegatedHistoryState(runtime);
  if (hasSameHistoryState(runtime.state, next)) {
    return runtime.state;
  }
  runtime.state = next;
  return next;
}

function notifyHistoryStateListeners(
  host: WorkspaceHost,
  runtime: WorkspaceHistoryRuntime,
): void {
  const previous = runtime.state;
  const next = readRuntimeHistoryState(host, runtime);
  if (next === previous || runtime.disposed) {
    return;
  }
  for (const listener of [...runtime.listeners]) {
    listener(next);
  }
}

function getRequiredCapabilities(
  kind: WorkspaceHistoryChangeKind,
  before: WorkspaceSnapshot<WorkspaceDocument>,
  after: WorkspaceSnapshot<WorkspaceDocument>,
): ReadonlyArray<WorkspaceHistoryCapability> {
  if (kind === "section-move") {
    return getSectionMoveCapabilities(before, after);
  }
  return REQUIRED_CAPABILITIES_BY_KIND[kind];
}

function getSectionMoveCapabilities(
  before: WorkspaceSnapshot<WorkspaceDocument>,
  after: WorkspaceSnapshot<WorkspaceDocument>,
): ReadonlyArray<WorkspaceHistoryCapability> {
  const required = new Set<WorkspaceHistoryCapability>();
  if (
    !areWorkspaceValuesEqual(before.topLevelSections, after.topLevelSections)
  ) {
    required.add("canEditLayout");
  }
  if (hasChangedSectionChildren(before, after)) {
    required.add("canEditStructure");
  }
  if (required.size === 0) {
    required.add("canEditStructure");
    required.add("canEditLayout");
  }
  const capabilities: Array<WorkspaceHistoryCapability> = [];
  if (required.has("canEditStructure")) {
    capabilities.push("canEditStructure");
  }
  if (required.has("canEditLayout")) {
    capabilities.push("canEditLayout");
  }
  return Object.freeze(capabilities);
}

function hasChangedSectionChildren(
  before: WorkspaceSnapshot<WorkspaceDocument>,
  after: WorkspaceSnapshot<WorkspaceDocument>,
): boolean {
  const ids = new Set([
    ...Object.keys(before.sections),
    ...Object.keys(after.sections),
  ]);
  for (const id of ids) {
    const beforeChildren = before.sections[id]?.children;
    const afterChildren = after.sections[id]?.children;
    if (!areWorkspaceValuesEqual(beforeChildren, afterChildren)) {
      return true;
    }
  }
  return false;
}

function areWorkspaceValuesEqual(left: unknown, right: unknown): boolean {
  return _.isEqual(left, right);
}

function createHistoryTransaction(
  kind: WorkspaceHistoryChangeKind,
  before: WorkspaceSnapshot<WorkspaceDocument>,
  after: WorkspaceSnapshot<WorkspaceDocument>,
): WorkspaceHistoryTransaction {
  return Object.freeze({
    after,
    before,
    kind,
    requiredCapabilities: getRequiredCapabilities(kind, before, after),
  });
}

function recordLocalTransaction(
  runtime: WorkspaceHistoryRuntime & LocalHistoryRuntime,
  transaction: WorkspaceHistoryTransaction,
): void {
  runtime.past.push(transaction);
  if (runtime.past.length > runtime.limit) {
    runtime.past.splice(0, runtime.past.length - runtime.limit);
  }
  runtime.future.splice(0, runtime.future.length);
}

function recordWorkspaceHistoryTransaction(
  host: WorkspaceHost,
  runtime: WorkspaceHistoryRuntime,
  kind: WorkspaceHistoryChangeKind,
  before: WorkspaceSnapshot<WorkspaceDocument>,
  after: WorkspaceSnapshot<WorkspaceDocument>,
): void {
  if (areWorkspaceValuesEqual(before, after)) {
    return;
  }
  const transaction = createHistoryTransaction(kind, before, after);
  if (runtime.kind === "local") {
    recordLocalTransaction(runtime, transaction);
  } else {
    runtime.authority.record(transaction);
  }
  notifyHistoryStateListeners(host, runtime);
}

function getRuntime(host: WorkspaceHost): WorkspaceHistoryRuntime | null {
  assertWorkspaceHostActive(host);
  return runtimeByHost.get(host) ?? null;
}

function toFrozenDocument(
  document: WorkspaceDocument,
): WorkspaceSnapshot<WorkspaceDocument> {
  return cloneFrozenWorkspaceSnapshot(document);
}

function restoreWorkspaceHistoryFocus(
  host: WorkspaceHost,
  runtime: WorkspaceHistoryRuntime,
  document: WorkspaceDocument,
): void {
  if (typeof requestAnimationFrame === "undefined") {
    return;
  }
  const frame = requestAnimationFrame(() => {
    runtime.focusFrames.delete(frame);
    if (runtime.disposed) {
      return;
    }
    const sectionRefs = getSectionRefsStore(host).getState();
    for (const sectionId of document.activeIds) {
      const section =
        sectionRefs.selfOnly[sectionId] ?? sectionRefs.withNested[sectionId];
      if (section) {
        section.focus({ preventScroll: true });
        return;
      }
    }
    const pane = getWorkspaceHostElements(host)
      .map((element) => element.querySelector<HTMLElement>(".react-flow__pane"))
      .find((element) => element !== null);
    pane?.focus({ preventScroll: true });
  });
  runtime.focusFrames.add(frame);
}

function replayLocalTransaction(
  host: WorkspaceHost,
  runtime: WorkspaceHistoryRuntime & LocalHistoryRuntime,
  direction: "redo" | "undo",
): boolean {
  if (batchStateByHost.get(host)?.active) {
    return false;
  }
  const replay = prepareLocalWorkspaceHistoryReplay(runtime, direction);
  if (!replay) {
    return false;
  }
  const disabledReason = getCapabilityDisabledReason(
    host,
    direction,
    replay.transaction.requiredCapabilities,
  );
  if (disabledReason !== null) {
    return false;
  }
  const liveDocument = runtime.access.getDocument(host);
  const refreshedTransaction = refreshWorkspaceHistoryTransaction(
    replay.transaction,
    direction,
    toFrozenDocument(liveDocument),
  );
  const replayDocument = createWorkspaceHistoryReplayDocument({
    live: liveDocument,
    source: replay.sourceDocument,
    target: replay.target,
  });
  replay.source.pop();
  replay.destination.push(refreshedTransaction);
  runtime.replayDepth += 1;
  try {
    runtime.access.replayDocument(host, replayDocument);
  } catch (error) {
    reconcileFailedWorkspaceHistoryReplay(
      host,
      runtime,
      replay,
      replayDocument,
    );
    throw error;
  } finally {
    runtime.replayDepth -= 1;
  }
  runtime.observedDocument = toFrozenDocument(runtime.access.getDocument(host));
  notifyHistoryStateListeners(host, runtime);
  restoreWorkspaceHistoryFocus(host, runtime, replayDocument);
  return true;
}

function prepareLocalWorkspaceHistoryReplay(
  runtime: WorkspaceHistoryRuntime & LocalHistoryRuntime,
  direction: "redo" | "undo",
): LocalWorkspaceHistoryReplay | null {
  const source = direction === "undo" ? runtime.past : runtime.future;
  const destination = direction === "undo" ? runtime.future : runtime.past;
  const transaction = source.at(-1);
  if (!transaction) {
    return null;
  }
  return {
    destination,
    source,
    sourceDocument:
      direction === "undo" ? transaction.after : transaction.before,
    target: direction === "undo" ? transaction.before : transaction.after,
    transaction,
  };
}

function reconcileFailedWorkspaceHistoryReplay(
  host: WorkspaceHost,
  runtime: WorkspaceHistoryRuntime & LocalHistoryRuntime,
  replay: LocalWorkspaceHistoryReplay,
  replayDocument: WorkspaceDocument,
): void {
  const publishedDocument = runtime.access.getDocument(host);
  if (areWorkspaceValuesEqual(publishedDocument, replayDocument)) {
    runtime.observedDocument = toFrozenDocument(publishedDocument);
    notifyHistoryStateListeners(host, runtime);
    restoreWorkspaceHistoryFocus(host, runtime, replayDocument);
    return;
  }
  replay.destination.pop();
  replay.source.push(replay.transaction);
}

function refreshWorkspaceHistoryTransaction(
  transaction: WorkspaceHistoryTransaction,
  direction: "redo" | "undo",
  source: WorkspaceSnapshot<WorkspaceDocument>,
): WorkspaceHistoryTransaction {
  return Object.freeze({
    ...transaction,
    ...(direction === "undo" ? { after: source } : { before: source }),
  });
}

export function initializeWorkspaceHistory(
  host: WorkspaceHost,
  options: WorkspaceHostOptions["history"],
  access: WorkspaceHistoryDocumentAccess,
): void {
  if (options === undefined) {
    return;
  }
  assertWorkspaceHostActive(host);
  assertWorkspaceHistoryOptions(options);
  if (runtimeByHost.has(host)) {
    throw new Error("Workspace history was initialized more than once.");
  }
  const observedDocument = toFrozenDocument(access.getDocument(host));
  const runtime =
    options.kind === "local"
      ? createLocalHistoryRuntime(options, access, observedDocument)
      : createDelegatedHistoryRuntime(options, access, observedDocument);
  runtime.state = readRuntimeHistoryState(host, runtime);
  subscribeWorkspaceHistoryRuntime(host, runtime);
  runtimeByHost.set(host, runtime);
  registerWorkspaceHostCleanup(host, () => {
    runtime.disposed = true;
    runtime.unsubscribeCapabilities();
    if (runtime.kind === "delegated") {
      runtime.unsubscribeAuthority?.();
    }
    for (const frame of runtime.focusFrames) {
      cancelAnimationFrame(frame);
    }
    runtime.focusFrames.clear();
    runtime.listeners.clear();
    if (runtime.kind === "delegated") {
      runtime.authority.dispose?.();
    }
    runtimeByHost.delete(host);
  });
}

function subscribeWorkspaceHistoryRuntime(
  host: WorkspaceHost,
  runtime: WorkspaceHistoryRuntime,
): void {
  const unsubscribeCapabilities = getWorkspaceCapabilitiesStore(host).subscribe(
    () => notifyHistoryStateListeners(host, runtime),
  );
  if (runtime.kind === "local") {
    runtime.unsubscribeCapabilities = unsubscribeCapabilities;
    return;
  }
  try {
    const unsubscribeAuthority = runtime.authority.subscribe(() =>
      notifyHistoryStateListeners(host, runtime),
    );
    if (typeof unsubscribeAuthority !== "function") {
      throw new Error(
        "Delegated workspace history authority subscribe() must return an unsubscribe function.",
      );
    }
    runtime.unsubscribeAuthority = unsubscribeAuthority;
    runtime.unsubscribeCapabilities = unsubscribeCapabilities;
  } catch (error) {
    unsubscribeCapabilities();
    throw error;
  }
}

function createLocalHistoryRuntime(
  options: Extract<WorkspaceHostOptions["history"], { kind: "local" }>,
  access: WorkspaceHistoryDocumentAccess,
  observedDocument: WorkspaceSnapshot<WorkspaceDocument>,
): WorkspaceHistoryRuntime & LocalHistoryRuntime {
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
  return {
    access,
    disposed: false,
    focusFrames: new Set(),
    future: [],
    kind: "local",
    limit,
    listeners: new Set(),
    observedDocument,
    past: [],
    replayDepth: 0,
    state: HISTORY_DISABLED_STATE,
    unsubscribeCapabilities: () => undefined,
  };
}

function createDelegatedHistoryRuntime(
  options: Extract<WorkspaceHostOptions["history"], { kind: "delegated" }>,
  access: WorkspaceHistoryDocumentAccess,
  observedDocument: WorkspaceSnapshot<WorkspaceDocument>,
): WorkspaceHistoryRuntime & DelegatedHistoryRuntime {
  assertWorkspaceHistoryAuthority(options.authority);
  return {
    access,
    authority: options.authority,
    disposed: false,
    focusFrames: new Set(),
    kind: "delegated",
    listeners: new Set(),
    observedDocument,
    replayDepth: 0,
    state: HISTORY_DISABLED_STATE,
    unsubscribeAuthority: null,
    unsubscribeCapabilities: () => undefined,
  };
}

export function getWorkspaceHistoryState(
  host: WorkspaceHost,
): WorkspaceHistoryState {
  const runtime = getRuntime(host);
  return runtime
    ? readRuntimeHistoryState(host, runtime)
    : HISTORY_DISABLED_STATE;
}

export function subscribeWorkspaceHistory(
  host: WorkspaceHost,
  listener: WorkspaceHistoryListener,
): () => void {
  if (typeof listener !== "function") {
    throw new Error("Workspace history listener must be a function.");
  }
  const runtime = getRuntime(host);
  if (!runtime) {
    return () => undefined;
  }
  runtime.listeners.add(listener);
  return () => runtime.listeners.delete(listener);
}

export function useWorkspaceHistoryState(): WorkspaceHistoryState {
  const host = useWorkspaceHost();
  return useSyncExternalStore(
    (listener) => subscribeWorkspaceHistory(host, () => listener()),
    () => getWorkspaceHistoryState(host),
    () => getWorkspaceHistoryState(host),
  );
}

export function notifyWorkspaceHistoryDocumentChange(
  host: WorkspaceHost,
  document: WorkspaceDocument,
  kind: WorkspaceHistoryChangeKind | null,
): void {
  const runtime = getRuntime(host);
  if (!runtime) {
    return;
  }
  if (kind !== null) {
    assertWorkspaceHistoryChangeKind(kind);
  }
  const after = toFrozenDocument(document);
  const batch = getBatchState(host).active;
  if (runtime.replayDepth > 0 || batch !== null || kind === null) {
    runtime.observedDocument = after;
    return;
  }
  const before = runtime.observedDocument;
  runtime.observedDocument = after;
  recordWorkspaceHistoryTransaction(host, runtime, kind, before, after);
}

export function synchronizeWorkspaceHistory(
  host: WorkspaceHost,
  source: WorkspaceHistorySynchronization["source"],
  document: WorkspaceDocument,
): void {
  const runtime = getRuntime(host);
  if (!runtime) {
    return;
  }
  const snapshot = toFrozenDocument(document);
  runtime.observedDocument = snapshot;
  const batch = getBatchState(host);
  if (batch.active !== null) {
    batch.active.before = null;
  }
  if (runtime.kind === "local") {
    runtime.past.splice(0, runtime.past.length);
    runtime.future.splice(0, runtime.future.length);
  } else {
    runtime.authority.synchronize(
      Object.freeze({ document: snapshot, source }),
    );
  }
  notifyHistoryStateListeners(host, runtime);
}

export function beginWorkspaceHistoryBatch(
  host: WorkspaceHost,
  kind: WorkspaceHistoryChangeKind,
): WorkspaceHistoryBatch {
  assertWorkspaceHostActive(host);
  assertWorkspaceHistoryChangeKind(kind);
  const state = getBatchState(host);
  if (state.active !== null) {
    throw new Error(
      "A workspace history batch is already active for this host.",
    );
  }
  const runtime = runtimeByHost.get(host);
  const token = Object.freeze({}) as WorkspaceHistoryBatch;
  state.active = {
    before: runtime ? toFrozenDocument(runtime.access.getDocument(host)) : null,
    kind,
    token,
  };
  if (runtime) {
    notifyHistoryStateListeners(host, runtime);
  }
  return token;
}

function resolveActiveWorkspaceHistoryBatch(
  host: WorkspaceHost,
  token: WorkspaceHistoryBatch,
): ActiveWorkspaceHistoryBatch {
  const active = getBatchState(host).active;
  if (active === null) {
    throw new Error("No workspace history batch is active for this host.");
  }
  if (active.token !== token) {
    throw new Error(
      "Workspace history batch token does not belong to this host.",
    );
  }
  return active;
}

export function completeWorkspaceHistoryBatch(
  host: WorkspaceHost,
  token: WorkspaceHistoryBatch,
): void {
  const active = resolveActiveWorkspaceHistoryBatch(host, token);
  const state = getBatchState(host);
  state.active = null;
  const runtime = getRuntime(host);
  if (!runtime) {
    return;
  }
  if (active.before === null) {
    notifyHistoryStateListeners(host, runtime);
    return;
  }
  const after = toFrozenDocument(runtime.access.getDocument(host));
  runtime.observedDocument = after;
  recordWorkspaceHistoryTransaction(
    host,
    runtime,
    active.kind,
    active.before,
    after,
  );
  notifyHistoryStateListeners(host, runtime);
}

export function cancelWorkspaceHistoryBatch(
  host: WorkspaceHost,
  token: WorkspaceHistoryBatch,
): void {
  resolveActiveWorkspaceHistoryBatch(host, token);
  getBatchState(host).active = null;
  const runtime = getRuntime(host);
  if (runtime) {
    runtime.observedDocument = toFrozenDocument(
      runtime.access.getDocument(host),
    );
    notifyHistoryStateListeners(host, runtime);
  }
}

export function undoWorkspace(host: WorkspaceHost): boolean {
  const runtime = getRuntime(host);
  if (!runtime) {
    return false;
  }
  if (runtime.kind === "local") {
    return replayLocalTransaction(host, runtime, "undo");
  }
  if (!readRuntimeHistoryState(host, runtime).canUndo) {
    return false;
  }
  runtime.authority.undo();
  return true;
}

export function redoWorkspace(host: WorkspaceHost): boolean {
  const runtime = getRuntime(host);
  if (!runtime) {
    return false;
  }
  if (runtime.kind === "local") {
    return replayLocalTransaction(host, runtime, "redo");
  }
  if (!readRuntimeHistoryState(host, runtime).canRedo) {
    return false;
  }
  runtime.authority.redo();
  return true;
}
