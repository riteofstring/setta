import type {
  TopLevelSectionLayout,
  Viewport,
  WorkspaceDocumentInput,
  WorkspaceSavedView,
  WorkspaceSavedViewsState,
} from "../document/types.js";

const UNSAFE_RECORD_KEYS = new Set(["__proto__", "constructor", "prototype"]);

type WorkspaceSavedViewsDocument = Pick<
  WorkspaceDocumentInput,
  "sections" | "topLevelSections" | "viewport"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be a record.`);
  }
  return value;
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
  label: string,
): void {
  const actualKeys = Object.keys(value);
  if (
    actualKeys.length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new Error(`${label} has an invalid shape.`);
  }
}

function assertRecordKey(key: string, label: string): void {
  if (UNSAFE_RECORD_KEYS.has(key)) {
    throw new Error(`${label} cannot use the reserved id ${key}.`);
  }
}

function createRecord<Value>(): Record<string, Value> {
  return Object.create(null) as Record<string, Value>;
}

function assertId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} requires a nonblank id.`);
  }
  if (value !== value.trim()) {
    throw new Error(
      `${label} id cannot include leading or trailing whitespace.`,
    );
  }
  assertRecordKey(value, label);
}

function assertFiniteNumber(
  value: unknown,
  label: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

function parseLayout(value: unknown, label: string): TopLevelSectionLayout {
  const record = assertRecord(value, label);
  assertExactKeys(record, ["h", "w", "x", "y", "zIndex"], label);
  assertFiniteNumber(record["x"], `${label} x`);
  assertFiniteNumber(record["y"], `${label} y`);
  assertFiniteNumber(record["zIndex"], `${label} zIndex`);
  const width = record["w"];
  const height = record["h"];
  if (width !== null) {
    assertFiniteNumber(width, `${label} width`);
    if (width < 0) {
      throw new Error(`${label} width cannot be negative.`);
    }
  }
  if (height !== null) {
    assertFiniteNumber(height, `${label} height`);
    if (height < 0) {
      throw new Error(`${label} height cannot be negative.`);
    }
  }
  return {
    h: height,
    w: width,
    x: record["x"],
    y: record["y"],
    zIndex: record["zIndex"],
  };
}

function parseTopLevelSections(
  value: unknown,
  label: string,
): Record<string, TopLevelSectionLayout> {
  const record = assertRecord(value, label);
  const layouts = createRecord<TopLevelSectionLayout>();
  for (const [sectionId, layout] of Object.entries(record)) {
    layouts[sectionId] = parseLayout(layout, `${label} section ${sectionId}`);
  }
  return layouts;
}

function parseViewport(value: unknown, label: string): Viewport | null {
  if (value === null) {
    return null;
  }
  const record = assertRecord(value, label);
  assertExactKeys(record, ["x", "y", "zoom"], label);
  assertFiniteNumber(record["x"], `${label} x`);
  assertFiniteNumber(record["y"], `${label} y`);
  assertFiniteNumber(record["zoom"], `${label} zoom`);
  if (record["zoom"] <= 0) {
    throw new Error(`${label} zoom must be greater than zero.`);
  }
  return { x: record["x"], y: record["y"], zoom: record["zoom"] };
}

function parseVisibility(
  value: unknown,
  label: string,
): Record<string, boolean> {
  const record = assertRecord(value, label);
  const visibility = createRecord<boolean>();
  for (const [sectionId, visible] of Object.entries(record)) {
    if (typeof visible !== "boolean") {
      throw new Error(`${label} section ${sectionId} must be boolean.`);
    }
    visibility[sectionId] = visible;
  }
  return visibility;
}

function parseView(value: unknown, recordId: string): WorkspaceSavedView {
  const label = `Saved view ${recordId}`;
  const record = assertRecord(value, label);
  assertExactKeys(
    record,
    [
      "id",
      "isTab",
      "name",
      "sortIndex",
      "topLevelSections",
      "viewport",
      "sectionVisibility",
    ],
    label,
  );
  assertId(record["id"], label);
  if (record["id"] !== recordId) {
    throw new Error(`${label} id must match its record key.`);
  }
  if (typeof record["isTab"] !== "boolean") {
    throw new Error(`${label} isTab must be boolean.`);
  }
  if (typeof record["name"] !== "string" || record["name"].trim() === "") {
    throw new Error(`${label} requires a nonblank name.`);
  }
  if (record["name"] !== record["name"].trim()) {
    throw new Error(
      `${label} name cannot include leading or trailing whitespace.`,
    );
  }
  assertFiniteNumber(record["sortIndex"], `${label} sortIndex`);
  if (record["sortIndex"] < 0 || !Number.isInteger(record["sortIndex"])) {
    throw new Error(`${label} sortIndex must be a non-negative integer.`);
  }
  return {
    id: record["id"],
    isTab: record["isTab"],
    name: record["name"],
    sortIndex: record["sortIndex"],
    topLevelSections: parseTopLevelSections(
      record["topLevelSections"],
      `${label} top-level layout`,
    ),
    viewport: parseViewport(record["viewport"], `${label} viewport`),
    sectionVisibility: parseVisibility(
      record["sectionVisibility"],
      `${label} visibility`,
    ),
  };
}

export function parseWorkspaceSavedViewsState(
  value: unknown,
): WorkspaceSavedViewsState {
  const record = assertRecord(value, "Saved views");
  assertExactKeys(record, ["activeViewId", "views"], "Saved views");
  assertId(record["activeViewId"], "Saved views active view");
  const rawViews = assertRecord(record["views"], "Saved views record");
  const views = createRecord<WorkspaceSavedView>();
  const names = new Set<string>();
  const sortIndexes = new Set<number>();
  for (const [viewId, view] of Object.entries(rawViews)) {
    assertId(viewId, "Saved view record");
    const parsed = parseView(view, viewId);
    if (names.has(parsed.name)) {
      throw new Error(`Saved view name ${parsed.name} is duplicated.`);
    }
    if (sortIndexes.has(parsed.sortIndex)) {
      throw new Error(
        `Saved view sort index ${parsed.sortIndex} is duplicated.`,
      );
    }
    names.add(parsed.name);
    sortIndexes.add(parsed.sortIndex);
    views[viewId] = parsed;
  }
  if (Object.keys(views).length === 0) {
    throw new Error("Saved views requires at least one view.");
  }
  if (!Object.hasOwn(views, record["activeViewId"])) {
    throw new Error(
      `Saved views active view ${record["activeViewId"]} does not exist.`,
    );
  }
  for (let index = 0; index < sortIndexes.size; index += 1) {
    if (!sortIndexes.has(index)) {
      throw new Error("Saved view sort indexes must be contiguous from zero.");
    }
  }
  return { activeViewId: record["activeViewId"], views };
}

function layoutsEqual(
  left: Record<string, TopLevelSectionLayout>,
  right: Record<string, TopLevelSectionLayout>,
): boolean {
  const leftIds = Object.keys(left);
  const rightIds = Object.keys(right);
  if (leftIds.length !== rightIds.length) {
    return false;
  }
  return leftIds.every((sectionId) => {
    if (!Object.hasOwn(left, sectionId) || !Object.hasOwn(right, sectionId)) {
      return false;
    }
    const leftLayout = left[sectionId];
    const rightLayout = right[sectionId];
    return (
      leftLayout !== undefined &&
      rightLayout !== undefined &&
      leftLayout.x === rightLayout.x &&
      leftLayout.y === rightLayout.y &&
      leftLayout.w === rightLayout.w &&
      leftLayout.h === rightLayout.h &&
      leftLayout.zIndex === rightLayout.zIndex
    );
  });
}

function visibilityEqual(
  left: Record<string, boolean>,
  right: Record<string, boolean>,
): boolean {
  const leftIds = Object.keys(left);
  const rightIds = Object.keys(right);
  return (
    leftIds.length === rightIds.length &&
    leftIds.every(
      (sectionId) =>
        Object.hasOwn(right, sectionId) && left[sectionId] === right[sectionId],
    )
  );
}

function viewportEqual(left: Viewport | null, right: Viewport | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}

function copyLayouts(
  layouts: Record<string, TopLevelSectionLayout>,
): Record<string, TopLevelSectionLayout> {
  const copied = createRecord<TopLevelSectionLayout>();
  for (const [sectionId, layout] of Object.entries(layouts)) {
    copied[sectionId] = { ...layout };
  }
  return copied;
}

function copyViewport(viewport: Viewport | null): Viewport | null {
  return viewport === null ? null : { ...viewport };
}

function reconcileView(
  view: WorkspaceSavedView,
  document: WorkspaceSavedViewsDocument,
): WorkspaceSavedView {
  const sectionVisibility = createRecord<boolean>();
  for (const sectionId of Object.keys(document.sections)) {
    sectionVisibility[sectionId] = Object.hasOwn(
      view.sectionVisibility,
      sectionId,
    )
      ? view.sectionVisibility[sectionId] === true
      : true;
  }
  const topLevelSections = createRecord<TopLevelSectionLayout>();
  for (const [sectionId, layout] of Object.entries(document.topLevelSections)) {
    const savedLayout = Object.hasOwn(view.topLevelSections, sectionId)
      ? view.topLevelSections[sectionId]
      : undefined;
    topLevelSections[sectionId] =
      savedLayout === undefined ? { ...layout } : { ...savedLayout };
  }
  if (
    layoutsEqual(view.topLevelSections, topLevelSections) &&
    visibilityEqual(view.sectionVisibility, sectionVisibility)
  ) {
    return view;
  }
  return { ...view, sectionVisibility, topLevelSections };
}

export function reconcileWorkspaceSavedViewsState(
  savedViews: WorkspaceSavedViewsState,
  document: WorkspaceSavedViewsDocument,
  options: { synchronizeActiveView?: boolean } = {},
): WorkspaceSavedViewsState {
  let changed = false;
  const views = createRecord<WorkspaceSavedView>();
  for (const [viewId, view] of Object.entries(savedViews.views)) {
    const reconciled = reconcileView(view, document);
    views[viewId] = reconciled;
    changed = changed || reconciled !== view;
  }
  const activeView = views[savedViews.activeViewId];
  if (!activeView) {
    throw new Error(
      `Saved views active view ${savedViews.activeViewId} does not exist.`,
    );
  }
  const synchronizeActiveView = options.synchronizeActiveView !== false;
  const activeViewNeedsSynchronization =
    synchronizeActiveView &&
    (!layoutsEqual(activeView.topLevelSections, document.topLevelSections) ||
      !viewportEqual(activeView.viewport, document.viewport));
  if (activeViewNeedsSynchronization) {
    views[savedViews.activeViewId] = {
      ...activeView,
      topLevelSections: copyLayouts(document.topLevelSections),
      viewport: copyViewport(document.viewport),
    };
    changed = true;
  }
  return changed
    ? { activeViewId: savedViews.activeViewId, views }
    : savedViews;
}

function assertMatchingIds(
  record: Record<string, unknown>,
  expectedIds: ReadonlyArray<string>,
  label: string,
): void {
  const actualIds = Object.keys(record);
  if (
    actualIds.length !== expectedIds.length ||
    expectedIds.some((id) => !Object.hasOwn(record, id))
  ) {
    throw new Error(`${label} must match the current workspace sections.`);
  }
}

export function assertWorkspaceSavedViewsStateForDocument(
  savedViews: WorkspaceSavedViewsState,
  document: WorkspaceSavedViewsDocument,
): void {
  const sectionIds = Object.keys(document.sections);
  const topLevelIds = Object.keys(document.topLevelSections);
  for (const view of Object.values(savedViews.views)) {
    assertMatchingIds(
      view.sectionVisibility,
      sectionIds,
      `Saved view ${view.id} visibility`,
    );
    assertMatchingIds(
      view.topLevelSections,
      topLevelIds,
      `Saved view ${view.id} top-level layout`,
    );
  }
}

export function createWorkspaceSavedViewsState(
  document: WorkspaceSavedViewsDocument,
  input: { id?: string; isTab?: boolean; name?: string } = {},
): WorkspaceSavedViewsState {
  const id = input.id ?? "view-1";
  const name = input.name ?? "View 1";
  const sectionVisibility = createRecord<boolean>();
  for (const sectionId of Object.keys(document.sections)) {
    sectionVisibility[sectionId] = true;
  }
  return parseWorkspaceSavedViewsState({
    activeViewId: id,
    views: {
      [id]: {
        id,
        isTab: input.isTab ?? false,
        name,
        sortIndex: 0,
        topLevelSections: copyLayouts(document.topLevelSections),
        viewport: copyViewport(document.viewport),
        sectionVisibility,
      },
    },
  });
}

export function getOrderedWorkspaceSavedViews(
  savedViews: WorkspaceSavedViewsState,
): Array<WorkspaceSavedView> {
  return Object.values(savedViews.views).sort(
    (left, right) => left.sortIndex - right.sortIndex,
  );
}

export function isWorkspaceSavedViewSectionVisible(
  savedViews: WorkspaceSavedViewsState | null,
  parentSectionMap: Record<string, string>,
  sectionId: string,
): boolean {
  if (savedViews === null) {
    return true;
  }
  const activeView = savedViews.views[savedViews.activeViewId];
  if (!activeView) {
    throw new Error(
      `Saved views active view ${savedViews.activeViewId} does not exist.`,
    );
  }
  const visited = new Set<string>();
  let currentId: string | null = sectionId;
  while (currentId !== null) {
    if (visited.has(currentId)) {
      throw new Error(`Section ${sectionId} has a cyclic parent chain.`);
    }
    visited.add(currentId);
    if (
      Object.hasOwn(activeView.sectionVisibility, currentId) &&
      activeView.sectionVisibility[currentId] === false
    ) {
      return false;
    }
    currentId = Object.hasOwn(parentSectionMap, currentId)
      ? (parentSectionMap[currentId] ?? null)
      : null;
  }
  return true;
}

function buildParentSectionMap(
  document: WorkspaceSavedViewsDocument,
): Record<string, string> {
  const parentSectionMap = createRecord<string>();
  for (const [sectionId, section] of Object.entries(document.sections)) {
    for (const childId of section.children) {
      if (Object.hasOwn(document.sections, childId)) {
        parentSectionMap[childId] = sectionId;
      }
    }
  }
  return parentSectionMap;
}

export function projectWorkspaceDocumentSavedViews(
  document: WorkspaceDocumentInput,
): WorkspaceDocumentInput {
  if (document.savedViews === null) {
    return document;
  }
  const savedViews = reconcileWorkspaceSavedViewsState(
    parseWorkspaceSavedViewsState(document.savedViews),
    document,
    { synchronizeActiveView: false },
  );
  assertWorkspaceSavedViewsStateForDocument(savedViews, document);
  const activeView = savedViews.views[savedViews.activeViewId];
  if (!activeView) {
    throw new Error(
      `Saved views active view ${savedViews.activeViewId} does not exist.`,
    );
  }
  const parentSectionMap = buildParentSectionMap(document);
  return {
    ...document,
    activeIds: document.activeIds.filter((sectionId) =>
      isWorkspaceSavedViewSectionVisible(
        savedViews,
        parentSectionMap,
        sectionId,
      ),
    ),
    savedViews,
    topLevelSections: copyLayouts(activeView.topLevelSections),
    viewport: copyViewport(activeView.viewport),
  };
}
