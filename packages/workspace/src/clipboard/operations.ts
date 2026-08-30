import { getWorkspacePointerLocation } from "../canvas/pointerLocation";
import { screenToFlowPosition } from "../canvas/viewportPosition";
import { getActiveSectionIds } from "../document/activeSections";
import { getWorkspaceCapabilitiesStore } from "../document/capabilities";
import { GROUP_SECTION_KIND } from "../document/documentSelectors";
import { commitWorkspaceDocumentMutation } from "../document/loadWorkspaceDocument";
import { getRegisteredSectionKindOrThrow } from "../document/sectionKindRegistry";
import { getWorkspaceDocumentStore } from "../document/stores";
import { getSectionRefsStore } from "../section/sectionRefs";
import type { WorkspaceHost } from "../workspaceHost";
import { isWorkspaceHostActive } from "../workspaceHostInternals";
import {
  captureWorkspaceClipboardSelection,
  createWorkspaceLocalClipboardPayload,
} from "./capture";
import {
  parseWorkspaceClipboardEnvelope,
  serializeWorkspaceClipboardEnvelope,
} from "./envelope";
import { assertWorkspaceClipboardJsonValue } from "./json";
import { parseWorkspaceLocalClipboardPayload } from "./localPayload";
import { planWorkspaceLocalClipboardPaste } from "./planner";
import {
  beginWorkspaceClipboardOperation,
  getWorkspaceClipboardAuthorityMetadata,
  getWorkspaceClipboardRuntimeState,
} from "./registry";
import type {
  JsonValue,
  WorkspaceClipboardAuthority,
  WorkspaceClipboardAuthorityMetadata,
  WorkspaceClipboardAvailabilityAction,
  WorkspaceClipboardEnvelope,
  WorkspaceClipboardEnvelopeErrorCode,
  WorkspaceClipboardOperationLease,
} from "./types";

type WorkspaceClipboardOperation = "copy" | "duplicate" | "paste";

type WorkspaceClipboardDeclineReason =
  | "authority-unavailable"
  | "clipboard-unavailable"
  | "disposed"
  | "native-selection"
  | "no-selection"
  | "operation-pending"
  | "structural-editing-disabled";

type WorkspaceClipboardFailureCode =
  | WorkspaceClipboardEnvelopeErrorCode
  | "authority-copy-failed"
  | "authority-paste-failed"
  | "authority-result-invalid"
  | "clipboard-read-failed"
  | "clipboard-write-failed"
  | "invalid-local-payload";

export type WorkspaceClipboardOperationResult =
  | Readonly<{ rootIds: ReadonlyArray<string>; status: "copied" }>
  | Readonly<{ rootIds: ReadonlyArray<string>; status: "duplicated" }>
  | Readonly<{ rootIds: ReadonlyArray<string>; status: "pasted" }>
  | Readonly<{ reason: WorkspaceClipboardDeclineReason; status: "declined" }>
  | Readonly<{ code: WorkspaceClipboardFailureCode; status: "failed" }>;

export type WorkspaceClipboardAvailability = Readonly<{
  authority: WorkspaceClipboardAuthorityMetadata | null;
  copy: WorkspaceClipboardAvailabilityAction;
  duplicate: WorkspaceClipboardAvailabilityAction;
  paste: WorkspaceClipboardAvailabilityAction;
  pending: boolean;
}>;

type BrowserClipboard = Partial<Pick<Clipboard, "readText" | "writeText">>;

type AcquiredWorkspaceClipboardOperation = Readonly<{
  authority: WorkspaceClipboardAuthority;
  lease: WorkspaceClipboardOperationLease;
}>;

type WorkspaceClipboardOperationAcquisition =
  | AcquiredWorkspaceClipboardOperation
  | Readonly<{ result: WorkspaceClipboardOperationResult }>;

function createDeclined(
  reason: WorkspaceClipboardDeclineReason,
): WorkspaceClipboardOperationResult {
  return Object.freeze({ reason, status: "declined" });
}

function createFailed(
  code: WorkspaceClipboardFailureCode,
): WorkspaceClipboardOperationResult {
  return Object.freeze({ code, status: "failed" });
}

function createSuccessful(
  status: "copied" | "duplicated" | "pasted",
  rootIds: ReadonlyArray<string>,
): WorkspaceClipboardOperationResult {
  return Object.freeze({ rootIds: Object.freeze([...rootIds]), status });
}

function getBrowserClipboard(): BrowserClipboard | null {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return null;
  }
  return navigator.clipboard;
}

function canUseBrowserClipboard(
  operation: Extract<WorkspaceClipboardOperation, "copy" | "paste">,
): boolean {
  const clipboard = getBrowserClipboard();
  return operation === "copy"
    ? typeof clipboard?.writeText === "function"
    : typeof clipboard?.readText === "function";
}

function hasNonemptyBrowserTextSelection(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return (window.getSelection()?.toString().length ?? 0) > 0;
}

function getClipboardSelectionCount(host: WorkspaceHost): number {
  const state = getWorkspaceDocumentStore(host).getState();
  return getActiveSectionIds(host).filter((id) => state.sections[id]).length;
}

function getRuntimePreflightReason(
  host: WorkspaceHost,
): WorkspaceClipboardDeclineReason | null {
  if (!isWorkspaceHostActive(host)) {
    return "disposed";
  }
  const runtime = getWorkspaceClipboardRuntimeState(host);
  if (runtime.disposed) {
    return "disposed";
  }
  if (runtime.authority === null) {
    return "authority-unavailable";
  }
  return runtime.pending ? "operation-pending" : null;
}

function getSelectionPreflightReason(
  host: WorkspaceHost,
  operation: WorkspaceClipboardOperation,
): WorkspaceClipboardDeclineReason | null {
  if (operation === "paste") {
    return null;
  }
  if (getClipboardSelectionCount(host) === 0) {
    return "no-selection";
  }
  return operation === "copy" && hasNonemptyBrowserTextSelection()
    ? "native-selection"
    : null;
}

function getMutationPreflightReason(
  host: WorkspaceHost,
  operation: WorkspaceClipboardOperation,
): WorkspaceClipboardDeclineReason | null {
  return operation !== "copy" &&
    !getWorkspaceCapabilitiesStore(host).getState().canEditStructure
    ? "structural-editing-disabled"
    : null;
}

function getBrowserPreflightReason(
  operation: WorkspaceClipboardOperation,
): WorkspaceClipboardDeclineReason | null {
  return (operation === "copy" || operation === "paste") &&
    !canUseBrowserClipboard(operation)
    ? "clipboard-unavailable"
    : null;
}

function getPreflightReason(
  host: WorkspaceHost,
  operation: WorkspaceClipboardOperation,
): WorkspaceClipboardDeclineReason | null {
  for (const resolveReason of [
    () => getRuntimePreflightReason(host),
    () => getSelectionPreflightReason(host, operation),
    () => getMutationPreflightReason(host, operation),
    () => getBrowserPreflightReason(operation),
  ]) {
    const reason = resolveReason();
    if (reason !== null) {
      return reason;
    }
  }
  return null;
}

function getDisabledReason(
  reason: WorkspaceClipboardDeclineReason | null,
): string | null {
  if (reason === null) {
    return null;
  }
  if (reason === "authority-unavailable") {
    return "Section clipboard is not configured for this workspace.";
  }
  if (reason === "clipboard-unavailable") {
    return "The browser clipboard is unavailable.";
  }
  if (reason === "disposed") {
    return "This workspace has been disposed.";
  }
  if (reason === "native-selection") {
    return "Copy is unavailable while text is selected.";
  }
  if (reason === "no-selection") {
    return "Select one or more sections first.";
  }
  if (reason === "operation-pending") {
    return "A clipboard operation is already in progress.";
  }
  return "Structural editing is disabled in this workspace.";
}

function createAvailabilityAction(
  reason: WorkspaceClipboardDeclineReason | null,
): WorkspaceClipboardAvailabilityAction {
  return Object.freeze({
    disabledReason: getDisabledReason(reason),
    enabled: reason === null,
  });
}

export function getWorkspaceClipboardAvailability(
  host: WorkspaceHost,
): WorkspaceClipboardAvailability {
  if (!isWorkspaceHostActive(host)) {
    return Object.freeze({
      authority: null,
      copy: createAvailabilityAction("disposed"),
      duplicate: createAvailabilityAction("disposed"),
      paste: createAvailabilityAction("disposed"),
      pending: false,
    });
  }
  const runtime = getWorkspaceClipboardRuntimeState(host);
  return Object.freeze({
    authority:
      runtime.authority === null
        ? null
        : Object.freeze(
            getWorkspaceClipboardAuthorityMetadata(runtime.authority),
          ),
    copy: createAvailabilityAction(getPreflightReason(host, "copy")),
    duplicate: createAvailabilityAction(getPreflightReason(host, "duplicate")),
    paste: createAvailabilityAction(getPreflightReason(host, "paste")),
    pending: runtime.pending,
  });
}

function acquireWorkspaceClipboardOperation(
  host: WorkspaceHost,
  operation: WorkspaceClipboardOperation,
): WorkspaceClipboardOperationAcquisition {
  const preflightReason = getPreflightReason(host, operation);
  if (preflightReason !== null) {
    return { result: createDeclined(preflightReason) };
  }
  const lease = beginWorkspaceClipboardOperation(host);
  if (!lease) {
    return { result: createDeclined("operation-pending") };
  }
  const runtime = getWorkspaceClipboardRuntimeState(host);
  const authority = runtime.authority;
  if (runtime.disposed || authority === null) {
    lease.release();
    return {
      result: createDeclined(
        runtime.disposed ? "disposed" : "authority-unavailable",
      ),
    };
  }
  return { authority, lease };
}

function isOperationCurrent(
  host: WorkspaceHost,
  authority: WorkspaceClipboardAuthority,
): boolean {
  if (!isWorkspaceHostActive(host)) {
    return false;
  }
  const runtime = getWorkspaceClipboardRuntimeState(host);
  return !runtime.disposed && runtime.authority === authority;
}

function getCurrentCapture(host: WorkspaceHost) {
  const state = getWorkspaceDocumentStore(host).getState();
  return captureWorkspaceClipboardSelection({
    activeIds: getActiveSectionIds(host),
    parentSectionMap: state.parentSectionMap,
    sections: state.sections,
    topLevelSections: state.topLevelSections,
  });
}

function isSectionKindSupported(host: WorkspaceHost, kind: string): boolean {
  if (kind === GROUP_SECTION_KIND) {
    return true;
  }
  try {
    getRegisteredSectionKindOrThrow(host, kind);
    return true;
  } catch {
    return false;
  }
}

function getSectionWidth(host: WorkspaceHost, sectionId: string): number {
  const state = getWorkspaceDocumentStore(host).getState();
  const layout = state.topLevelSections[sectionId];
  const section = state.sections[sectionId];
  if (!layout || !section) {
    return 0;
  }
  if (layout.w !== null) {
    return layout.w;
  }
  return section.size.width === "auto" ? 0 : section.size.width;
}

function resolveTopLevelAncestor(
  host: WorkspaceHost,
  sectionId: string,
): string | null {
  const state = getWorkspaceDocumentStore(host).getState();
  const visited = new Set<string>();
  let currentId: string | null = sectionId;
  while (currentId !== null) {
    if (visited.has(currentId) || !state.sections[currentId]) {
      return null;
    }
    visited.add(currentId);
    if (state.topLevelSections[currentId]) {
      return currentId;
    }
    currentId = state.parentSectionMap[currentId] ?? null;
  }
  return null;
}

function resolveWorkspaceClipboardPastePlacement(host: WorkspaceHost): {
  x: number;
  y: number;
} {
  const pointer = getWorkspacePointerLocation(host);
  if (pointer) {
    const placement = screenToFlowPosition(host, pointer);
    if (Number.isFinite(placement.x) && Number.isFinite(placement.y)) {
      return placement;
    }
  }
  const state = getWorkspaceDocumentStore(host).getState();
  const selectedTopLevelIds = new Set<string>();
  for (const sectionId of getActiveSectionIds(host)) {
    const topLevelId = resolveTopLevelAncestor(host, sectionId);
    if (topLevelId !== null) {
      selectedTopLevelIds.add(topLevelId);
    }
  }
  const selectedLayouts = [...selectedTopLevelIds].flatMap((sectionId) => {
    const layout = state.topLevelSections[sectionId];
    return layout ? [[sectionId, layout] as const] : [];
  });
  if (selectedLayouts.length > 0) {
    return {
      x:
        Math.max(
          ...selectedLayouts.map(
            ([sectionId, layout]) =>
              layout.x + getSectionWidth(host, sectionId),
          ),
        ) + 40,
      y: Math.min(...selectedLayouts.map(([, layout]) => layout.y)),
    };
  }
  return { x: 24, y: 24 };
}

function createWorkspaceClipboardIdentifierAllocator(host: WorkspaceHost) {
  const allocatedSectionIds = new Set(
    Object.keys(getWorkspaceDocumentStore(host).getState().sections),
  );
  const allocatedItemIdsBySection = new Map<string, Set<string>>();
  const allocate = (sourceId: string, allocated: Set<string>): string => {
    const base = `${sourceId}-copy`;
    let candidate = base;
    let suffix = 2;
    while (allocated.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    allocated.add(candidate);
    return candidate;
  };
  return {
    allocateItemId: (sourceSectionId: string, sourceItemId: string) => {
      const allocated =
        allocatedItemIdsBySection.get(sourceSectionId) ?? new Set<string>();
      allocatedItemIdsBySection.set(sourceSectionId, allocated);
      return allocate(sourceItemId, allocated);
    },
    allocateSectionId: (sourceSectionId: string) =>
      allocate(sourceSectionId, allocatedSectionIds),
  };
}

function scheduleWorkspaceClipboardFocus(
  host: WorkspaceHost,
  rootIds: ReadonlyArray<string>,
): void {
  if (typeof requestAnimationFrame === "undefined") {
    return;
  }
  requestAnimationFrame(() => {
    if (!isWorkspaceHostActive(host)) {
      return;
    }
    const state = getWorkspaceDocumentStore(host).getState();
    const sectionId = rootIds.find((id) => state.sections[id]);
    if (!sectionId) {
      return;
    }
    const refs = getSectionRefsStore(host).getState();
    (refs.selfOnly[sectionId] ?? refs.withNested[sectionId])?.focus({
      preventScroll: true,
    });
  });
}

function getDelegatedPasteResultRecord(
  value: unknown,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "Delegated workspace clipboard paste must return an object.",
    );
  }
  return value as Record<string, unknown>;
}

function getDelegatedPasteRootIds(
  candidate: Record<string, unknown>,
): ReadonlyArray<unknown> {
  if (
    Object.keys(candidate).length !== 1 ||
    !Object.hasOwn(candidate, "rootIds") ||
    !Array.isArray(candidate["rootIds"])
  ) {
    throw new Error(
      "Delegated workspace clipboard paste must return only canonical rootIds.",
    );
  }
  return candidate["rootIds"];
}

function assertDelegatedRootIds(rootIds: ReadonlyArray<unknown>): void {
  const seen = new Set<string>();
  for (const rootId of rootIds) {
    if (
      typeof rootId !== "string" ||
      rootId.trim() === "" ||
      rootId !== rootId.trim() ||
      seen.has(rootId)
    ) {
      throw new Error(
        "Delegated workspace clipboard paste must return unique nonblank rootIds.",
      );
    }
    seen.add(rootId);
  }
  if (seen.size === 0) {
    throw new Error(
      "Delegated workspace clipboard paste must return at least one rootId.",
    );
  }
}

function assertDelegatedPasteResult(
  value: unknown,
): asserts value is Readonly<{ rootIds: ReadonlyArray<string> }> {
  assertDelegatedRootIds(
    getDelegatedPasteRootIds(getDelegatedPasteResultRecord(value)),
  );
}

async function prepareDelegatedClipboardPayload(
  authority: Extract<WorkspaceClipboardAuthority, { kind: "delegated" }>,
  captured: ReturnType<typeof getCurrentCapture>,
): Promise<
  | Readonly<{ payload: JsonValue }>
  | Readonly<{ result: WorkspaceClipboardOperationResult }>
> {
  let payload: unknown;
  try {
    payload = await authority.prepareCopy({
      fragment: captured.fragment,
      rootIds: captured.fragment.roots,
      source: captured.source,
    });
  } catch {
    return { result: createFailed("authority-copy-failed") };
  }
  assertWorkspaceClipboardJsonValue(payload);
  return { payload };
}

export async function copyWorkspaceSelection(
  host: WorkspaceHost,
): Promise<WorkspaceClipboardOperationResult> {
  const acquired = acquireWorkspaceClipboardOperation(host, "copy");
  if ("result" in acquired) {
    return acquired.result;
  }
  try {
    const captured = getCurrentCapture(host);
    const prepared =
      acquired.authority.kind === "local"
        ? { payload: createWorkspaceLocalClipboardPayload(captured) }
        : await prepareDelegatedClipboardPayload(acquired.authority, captured);
    if ("result" in prepared) {
      return prepared.result;
    }
    if (!isOperationCurrent(host, acquired.authority)) {
      return createDeclined("disposed");
    }
    const clipboard = getBrowserClipboard();
    if (typeof clipboard?.writeText !== "function") {
      return createDeclined("clipboard-unavailable");
    }
    const text = serializeWorkspaceClipboardEnvelope({
      authority: getWorkspaceClipboardAuthorityMetadata(acquired.authority),
      fragment: captured.fragment,
      payload: prepared.payload,
      schema: "setta.workspace.section-clipboard",
      version: 1,
    });
    try {
      await clipboard.writeText(text);
    } catch {
      return createFailed("clipboard-write-failed");
    }
    return isOperationCurrent(host, acquired.authority)
      ? createSuccessful("copied", captured.fragment.roots)
      : createDeclined("disposed");
  } finally {
    acquired.lease.release();
  }
}

async function pastePreparedWorkspaceClipboard(
  host: WorkspaceHost,
  authority: WorkspaceClipboardAuthority,
  envelope: WorkspaceClipboardEnvelope,
  status: "duplicated" | "pasted",
): Promise<WorkspaceClipboardOperationResult> {
  const placement = resolveWorkspaceClipboardPastePlacement(host);
  if (authority.kind === "local") {
    const localPayload = parseWorkspaceLocalClipboardPayload(
      envelope.payload,
      envelope.fragment,
    );
    if (!localPayload.ok) {
      return createFailed(localPayload.code);
    }
    const plan = planWorkspaceLocalClipboardPaste({
      allocator: createWorkspaceClipboardIdentifierAllocator(host),
      authority,
      document: host.getSnapshot(),
      fragment: envelope.fragment,
      payload: localPayload.payload,
      placement,
    });
    if (!isOperationCurrent(host, authority)) {
      return createDeclined("disposed");
    }
    commitWorkspaceDocumentMutation(host, plan.nextDocument, "section-create");
    scheduleWorkspaceClipboardFocus(host, plan.rootIds);
    return createSuccessful(status, plan.rootIds);
  }
  let result: unknown;
  try {
    result = await authority.paste({
      fragment: envelope.fragment,
      payload: envelope.payload,
      payloadVersion: envelope.authority.payloadVersion,
      placement,
      rootIds: envelope.fragment.roots,
    });
  } catch {
    return createFailed("authority-paste-failed");
  }
  assertDelegatedPasteResult(result);
  if (!isOperationCurrent(host, authority)) {
    return createDeclined("disposed");
  }
  scheduleWorkspaceClipboardFocus(host, result.rootIds);
  return createSuccessful(status, result.rootIds);
}

export async function pasteWorkspaceClipboard(
  host: WorkspaceHost,
): Promise<WorkspaceClipboardOperationResult> {
  const acquired = acquireWorkspaceClipboardOperation(host, "paste");
  if ("result" in acquired) {
    return acquired.result;
  }
  try {
    const clipboard = getBrowserClipboard();
    if (typeof clipboard?.readText !== "function") {
      return createDeclined("clipboard-unavailable");
    }
    let text: string;
    try {
      text = await clipboard.readText();
    } catch {
      return createFailed("clipboard-read-failed");
    }
    if (!isOperationCurrent(host, acquired.authority)) {
      return createDeclined("disposed");
    }
    const parsed = parseWorkspaceClipboardEnvelope(text, {
      authority: getWorkspaceClipboardAuthorityMetadata(acquired.authority),
      isSectionKindSupported: (kind) => isSectionKindSupported(host, kind),
    });
    if (!parsed.ok) {
      return createFailed(parsed.code);
    }
    return await pastePreparedWorkspaceClipboard(
      host,
      acquired.authority,
      parsed.envelope,
      "pasted",
    );
  } finally {
    acquired.lease.release();
  }
}

export async function duplicateWorkspaceSelection(
  host: WorkspaceHost,
): Promise<WorkspaceClipboardOperationResult> {
  const acquired = acquireWorkspaceClipboardOperation(host, "duplicate");
  if ("result" in acquired) {
    return acquired.result;
  }
  try {
    const captured = getCurrentCapture(host);
    const prepared =
      acquired.authority.kind === "local"
        ? { payload: createWorkspaceLocalClipboardPayload(captured) }
        : await prepareDelegatedClipboardPayload(acquired.authority, captured);
    if ("result" in prepared) {
      return prepared.result;
    }
    if (!isOperationCurrent(host, acquired.authority)) {
      return createDeclined("disposed");
    }
    return await pastePreparedWorkspaceClipboard(
      host,
      acquired.authority,
      {
        authority: getWorkspaceClipboardAuthorityMetadata(acquired.authority),
        fragment: captured.fragment,
        payload: prepared.payload,
        schema: "setta.workspace.section-clipboard",
        version: 1,
      },
      "duplicated",
    );
  } finally {
    acquired.lease.release();
  }
}
