import {
  denormalizeWorkspaceWindowBounds,
  normalizeWorkspaceWindowBounds,
  type WorkspaceNormalizedWindowBounds,
} from "./windowingSnapLayout";
import { getWorkspaceWindowStackingOrder } from "./windowingState";
import {
  assertKnownFields,
  assertRecord,
  assertTrimmedNonblankString,
  assertWorkspaceWindowingLayoutEditable,
  createWorkspaceFloatingWindow,
  createWorkspaceWindowingState,
  type WorkspaceFloatingWindow,
  type WorkspaceWindowJsonValue,
  type WorkspaceWindowingMutationOptions,
  type WorkspaceWindowingState,
  type WorkspaceWindowViewport,
  WorkspaceWindowingError,
} from "./windowingTypes";

export interface WorkspaceWindowSpaceWindow {
  readonly id: string;
  readonly contentId: string;
  readonly surfaceKind: string;
  readonly title: string;
  readonly rendererData: WorkspaceWindowJsonValue;

  readonly sectionId: string | null;
  readonly normalizedBounds: WorkspaceNormalizedWindowBounds;
  readonly zIndex: number;
}

export interface WorkspaceWindowSpace {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly windows: readonly WorkspaceWindowSpaceWindow[];
}

export interface WorkspaceWindowSpaceInput {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly windows: readonly WorkspaceWindowSpaceWindow[];
}

export interface WorkspaceWindowSpaceMetadata {
  readonly id: string;
  readonly name: string;
  readonly order: number;
}

export interface WorkspaceWindowSpaceRestoreResult {
  readonly state: WorkspaceWindowingState;

  readonly idRemaps: Readonly<Record<string, string>>;
}

interface WindowSpaceRestorePlan {
  readonly snapshot: WorkspaceWindowSpaceWindow;
  readonly targetId: string;
  readonly replacesWindowId: string | null;
}

const SPACE_FIELDS = new Set(["id", "name", "order", "windows"]);
const SPACE_WINDOW_FIELDS = new Set([
  "id",
  "contentId",
  "surfaceKind",
  "title",
  "rendererData",
  "sectionId",
  "normalizedBounds",
  "zIndex",
]);
const NORMALIZED_BOUNDS_FIELDS = new Set(["x", "y", "width", "height"]);

function assertNonnegativeInteger(value: unknown, owner: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      `${owner} must be a nonnegative integer.`,
    );
  }
  return value;
}

function assertNormalizedFraction(
  value: unknown,
  owner: string,
  allowZero: boolean,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1 ||
    (!allowZero && value === 0)
  ) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      `${owner} must be a ${allowZero ? "" : "positive "}normalized fraction.`,
    );
  }
  return value;
}

function createNormalizedBounds(
  value: unknown,
): WorkspaceNormalizedWindowBounds {
  const record = assertRecord(value, "Workspace Window Space normalizedBounds");
  assertKnownFields(
    record,
    NORMALIZED_BOUNDS_FIELDS,
    "Workspace Window Space normalizedBounds",
  );
  return Object.freeze({
    x: assertNormalizedFraction(
      record.x,
      "Workspace Window Space normalizedBounds.x",
      true,
    ),
    y: assertNormalizedFraction(
      record.y,
      "Workspace Window Space normalizedBounds.y",
      true,
    ),
    width: assertNormalizedFraction(
      record.width,
      "Workspace Window Space normalizedBounds.width",
      false,
    ),
    height: assertNormalizedFraction(
      record.height,
      "Workspace Window Space normalizedBounds.height",
      false,
    ),
  });
}

function createWorkspaceWindowSpaceWindow(
  value: unknown,
): WorkspaceWindowSpaceWindow {
  const record = assertRecord(value, "Workspace Window Space window");
  assertKnownFields(
    record,
    SPACE_WINDOW_FIELDS,
    "Workspace Window Space window",
  );
  const window = createWorkspaceFloatingWindow({
    id: record.id as string,
    contentId: record.contentId as string,
    surfaceKind: record.surfaceKind as string,
    title: record.title as string,
    rendererData: record.rendererData as WorkspaceWindowJsonValue,
    sectionId: record.sectionId as string | null,
    bounds: { x: 0, y: 0, width: 1, height: 1 },
  });
  return Object.freeze({
    id: window.id,
    contentId: window.contentId,
    surfaceKind: window.surfaceKind,
    title: window.title,
    rendererData: window.rendererData,
    sectionId: window.sectionId,
    normalizedBounds: createNormalizedBounds(record.normalizedBounds),
    zIndex: assertNonnegativeInteger(
      record.zIndex,
      "Workspace Window Space window.zIndex",
    ),
  });
}

function assertUniqueWindowIdentities(
  windows: readonly WorkspaceWindowSpaceWindow[],
): void {
  const ids = new Set<string>();
  const contentIds = new Set<string>();
  const sectionIds = new Set<string>();
  for (const window of windows) {
    if (ids.has(window.id)) {
      throw new WorkspaceWindowingError(
        "duplicate_window_id",
        `Workspace Window Space contains duplicate window id ${window.id}.`,
      );
    }
    if (contentIds.has(window.contentId)) {
      throw new WorkspaceWindowingError(
        "duplicate_content_identity",
        `Workspace Window Space contains duplicate content identity ${window.contentId}.`,
      );
    }
    if (window.sectionId !== null && sectionIds.has(window.sectionId)) {
      throw new WorkspaceWindowingError(
        "duplicate_section_binding",
        `Workspace Window Space contains duplicate section binding ${window.sectionId}.`,
      );
    }
    ids.add(window.id);
    contentIds.add(window.contentId);
    if (window.sectionId !== null) sectionIds.add(window.sectionId);
  }
}

export function createWorkspaceWindowSpace(
  input: WorkspaceWindowSpaceInput | unknown,
): WorkspaceWindowSpace {
  const record = assertRecord(input, "Workspace Window Space");
  assertKnownFields(record, SPACE_FIELDS, "Workspace Window Space");
  if (!Array.isArray(record.windows)) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      "Workspace Window Space.windows must be an array.",
    );
  }
  const windows = record.windows.map(createWorkspaceWindowSpaceWindow);
  assertUniqueWindowIdentities(windows);
  return Object.freeze({
    id: assertTrimmedNonblankString(record.id, "Workspace Window Space.id"),
    name: assertTrimmedNonblankString(
      record.name,
      "Workspace Window Space.name",
    ),
    order: assertNonnegativeInteger(
      record.order,
      "Workspace Window Space.order",
    ),
    windows: Object.freeze(windows),
  });
}

function isSnapshotEligible(window: WorkspaceFloatingWindow): boolean {
  return (
    window.placement === "floating" && !window.isMinimized && !window.isClosed
  );
}

function createSnapshotWindow(
  window: WorkspaceFloatingWindow,
  viewport: WorkspaceWindowViewport,
): WorkspaceWindowSpaceWindow {
  return Object.freeze({
    id: window.id,
    contentId: window.contentId,
    surfaceKind: window.surfaceKind,
    title: window.title,
    rendererData: window.rendererData,
    sectionId: window.sectionId,
    normalizedBounds: normalizeWorkspaceWindowBounds(window.bounds, viewport),
    zIndex: window.zIndex,
  });
}

export function canSnapshotWorkspaceWindowSpace(
  stateInput: WorkspaceWindowingState,
): boolean {
  return createWorkspaceWindowingState(stateInput).windows.some(
    isSnapshotEligible,
  );
}

export function snapshotWorkspaceWindowSpace(
  stateInput: WorkspaceWindowingState,
  metadata: WorkspaceWindowSpaceMetadata,
  viewport: WorkspaceWindowViewport,
): WorkspaceWindowSpace {
  const state = createWorkspaceWindowingState(stateInput);
  const windows = getWorkspaceWindowStackingOrder(state)
    .filter(isSnapshotEligible)
    .map((window) => createSnapshotWindow(window, viewport));
  if (windows.length === 0) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      "A Window Space snapshot requires at least one visible floating window.",
    );
  }
  return createWorkspaceWindowSpace({ ...metadata, windows });
}

function createExistingWindowBySectionId(
  state: WorkspaceWindowingState,
): ReadonlyMap<string, WorkspaceFloatingWindow> {
  const windowsBySectionId = new Map<string, WorkspaceFloatingWindow>();
  for (const window of state.windows) {
    if (window.sectionId !== null) {
      windowsBySectionId.set(window.sectionId, window);
    }
  }
  return windowsBySectionId;
}

function isAuthoritativeSectionOwnerPlacement(
  placement: WorkspaceFloatingWindow["placement"],
): boolean {
  return (
    placement === "bottom_docked" ||
    placement === "canvas_section" ||
    placement === "maximized"
  );
}

function shouldSkipSavedSectionWindow(
  snapshot: WorkspaceWindowSpaceWindow,
  existingByContentId: ReadonlyMap<string, WorkspaceFloatingWindow>,
  existingBySectionId: ReadonlyMap<string, WorkspaceFloatingWindow>,
): boolean {
  if (snapshot.sectionId === null) {
    return false;
  }
  const currentByContent = existingByContentId.get(snapshot.contentId);
  const currentBySection = existingBySectionId.get(snapshot.sectionId);
  return [currentByContent, currentBySection].some(
    (window) =>
      window !== undefined &&
      isAuthoritativeSectionOwnerPlacement(window.placement),
  );
}

function resolveReusableExistingWindow(
  snapshot: WorkspaceWindowSpaceWindow,
  existingByContentId: ReadonlyMap<string, WorkspaceFloatingWindow>,
  existingBySectionId: ReadonlyMap<string, WorkspaceFloatingWindow>,
): WorkspaceFloatingWindow | undefined {
  const currentByContent = existingByContentId.get(snapshot.contentId);
  if (snapshot.sectionId === null) {
    return currentByContent;
  }
  const currentBySection = existingBySectionId.get(snapshot.sectionId);
  if (
    currentByContent !== undefined &&
    currentBySection !== undefined &&
    currentByContent.id !== currentBySection.id
  ) {
    return undefined;
  }
  return currentBySection ?? currentByContent;
}

function allocateRestoredWindowId(
  baseId: string,
  usedIds: Set<string>,
): string {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }
  let suffix = 2;
  let candidate = `${baseId}-${suffix}`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}-${suffix}`;
  }
  usedIds.add(candidate);
  return candidate;
}

function hasUnresolvedSavedSectionIdentityConflict(
  snapshot: WorkspaceWindowSpaceWindow,
  existing: WorkspaceFloatingWindow | undefined,
  existingByContentId: ReadonlyMap<string, WorkspaceFloatingWindow>,
  existingBySectionId: ReadonlyMap<string, WorkspaceFloatingWindow>,
): boolean {
  return (
    snapshot.sectionId !== null &&
    existing === undefined &&
    (existingByContentId.has(snapshot.contentId) ||
      existingBySectionId.has(snapshot.sectionId))
  );
}

function shouldSkipWorkspaceWindowSpaceRestore(
  snapshot: WorkspaceWindowSpaceWindow,
  existing: WorkspaceFloatingWindow | undefined,
  existingByContentId: ReadonlyMap<string, WorkspaceFloatingWindow>,
  existingBySectionId: ReadonlyMap<string, WorkspaceFloatingWindow>,
): boolean {
  return (
    shouldSkipSavedSectionWindow(
      snapshot,
      existingByContentId,
      existingBySectionId,
    ) ||
    hasUnresolvedSavedSectionIdentityConflict(
      snapshot,
      existing,
      existingByContentId,
      existingBySectionId,
    ) ||
    existing?.placement === "maximized"
  );
}

function createRestorePlan(
  state: WorkspaceWindowingState,
  space: WorkspaceWindowSpace,
): {
  readonly plans: readonly WindowSpaceRestorePlan[];
  readonly idRemaps: Readonly<Record<string, string>>;
} {
  const usedIds = new Set(state.windows.map((window) => window.id));
  const existingByContentId = new Map(
    state.windows.map((window) => [window.contentId, window]),
  );
  const existingBySectionId = createExistingWindowBySectionId(state);
  const plans: WindowSpaceRestorePlan[] = [];
  const idRemaps: Record<string, string> = {};
  for (const snapshot of space.windows) {
    const existing = resolveReusableExistingWindow(
      snapshot,
      existingByContentId,
      existingBySectionId,
    );
    if (
      shouldSkipWorkspaceWindowSpaceRestore(
        snapshot,
        existing,
        existingByContentId,
        existingBySectionId,
      )
    ) {
      continue;
    }
    const plan: WindowSpaceRestorePlan = existing
      ? { snapshot, targetId: existing.id, replacesWindowId: existing.id }
      : {
          snapshot,
          targetId: allocateRestoredWindowId(snapshot.id, usedIds),
          replacesWindowId: null,
        };
    if (plan.targetId !== snapshot.id) {
      idRemaps[snapshot.id] = plan.targetId;
    }
    plans.push(plan);
  }
  return { plans, idRemaps: Object.freeze(idRemaps) };
}

export function restoreWorkspaceWindowSpaceWindow(
  snapshot: WorkspaceWindowSpaceWindow,
  targetId: string,
  viewport: WorkspaceWindowViewport,
): WorkspaceFloatingWindow {
  return createWorkspaceFloatingWindow({
    id: targetId,
    contentId: snapshot.contentId,
    surfaceKind: snapshot.surfaceKind,
    title: snapshot.title,
    rendererData: snapshot.rendererData,
    sectionId: snapshot.sectionId,
    bounds: denormalizeWorkspaceWindowBounds(
      snapshot.normalizedBounds,
      viewport,
    ),
    placement: "floating",
    restoreBounds: null,
    restorePlacement: null,
    lastUnsnappedBounds: null,
    isMinimized: false,
    isClosed: false,
    zIndex: snapshot.zIndex,
  });
}

function mergeRestoredWindows(
  state: WorkspaceWindowingState,
  plans: readonly WindowSpaceRestorePlan[],
  viewport: WorkspaceWindowViewport,
): readonly WorkspaceFloatingWindow[] {
  const replacements = new Map<string, WorkspaceFloatingWindow>();
  const additions: WorkspaceFloatingWindow[] = [];
  for (const plan of plans) {
    const restored = restoreWorkspaceWindowSpaceWindow(
      plan.snapshot,
      plan.targetId,
      viewport,
    );
    if (plan.replacesWindowId === null) {
      additions.push(restored);
    } else {
      replacements.set(plan.replacesWindowId, restored);
    }
  }
  return [
    ...state.windows.map((window) => replacements.get(window.id) ?? window),
    ...additions,
  ];
}

export function restoreWorkspaceWindowSpace(
  stateInput: WorkspaceWindowingState,
  spaceInput: WorkspaceWindowSpace,
  viewport: WorkspaceWindowViewport,
  options?: WorkspaceWindowingMutationOptions,
): WorkspaceWindowSpaceRestoreResult {
  assertWorkspaceWindowingLayoutEditable(options);
  const state = createWorkspaceWindowingState(stateInput);
  const space = createWorkspaceWindowSpace(spaceInput);
  const { plans, idRemaps } = createRestorePlan(state, space);
  return Object.freeze({
    state: createWorkspaceWindowingState({
      windows: mergeRestoredWindows(state, plans, viewport),
      nextFocusOrder: state.nextFocusOrder,
    }),
    idRemaps,
  });
}
