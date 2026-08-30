import {
  applyLoadedDocumentViewport,
  armLoadedDocumentFitView,
} from "../canvas/documentViewportSync";
import { maybeCompleteInitialFitView } from "../canvas/nodeInternalsActions";
import { closeWorkspaceMenu } from "../context-menu/workspaceMenuState";
import {
  notifyWorkspaceDocumentChange,
  runWithWorkspaceDocumentChangeNotificationsSuppressed,
} from "../document/documentChangeCallback";
import { createNodesMapFromDocumentChildren } from "../document/nodeProjection";
import {
  getActiveSectionsStore,
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
  runWithAtomicallyPublishedWorkspaceStores,
  type WorkspaceDocumentState,
} from "../document/stores";
import { forceDeactivateDnd } from "../dnd/dndState";
import { manualDndChildrenReset } from "../dnd/dndChildren";
import { resetItemDragState } from "../items/itemDragHandlers";
import type {
  TopLevelSectionLayout,
  Viewport,
  WorkspaceSavedView,
  WorkspaceSavedViewsState,
} from "../document/types";
import { getWorkspaceCapabilitiesStore } from "../document/capabilities";
import type { WorkspaceHost } from "../workspaceHost";
import { isWorkspaceSavedViewEditing } from "./editingState";
import {
  assertWorkspaceSavedViewsStateForDocument,
  createWorkspaceSavedViewsState,
  getOrderedWorkspaceSavedViews,
  isWorkspaceSavedViewSectionVisible,
  parseWorkspaceSavedViewsState,
  reconcileWorkspaceSavedViewsState,
} from "./state";
import type {
  WorkspaceSavedViewCreateInput,
  WorkspaceSavedViewsEnableInput,
  WorkspaceSavedViewsOperation,
  WorkspaceSavedViewsOperationResult,
} from "./types";

const SAVED_VIEWS_DISABLED_REASON =
  "Saved views are not enabled for this workspace.";
const SAVED_VIEWS_LAYOUT_DISABLED_REASON =
  "Editing saved views requires permission to edit workspace layout.";
const SAVED_VIEWS_OPERATIONS = new Set<WorkspaceSavedViewsOperation>([
  "activate",
  "create",
  "delete",
  "enable",
  "rename",
  "reorder",
  "visibility",
]);
const UNSAFE_VIEW_IDS = new Set(["__proto__", "constructor", "prototype"]);

type SavedViewsPublicationInput = {
  applyViewport: boolean;
  document: WorkspaceDocumentState;
  resetInteractions: boolean;
  useDocumentLayoutDimensions: boolean;
};

type WorkspaceSavedViewsDeletion = {
  activeView: WorkspaceSavedView;
  activeViewId: string;
  activated: boolean;
  savedViews: WorkspaceSavedViewsState;
};

function copyTopLevelSections(
  topLevelSections: Record<string, TopLevelSectionLayout>,
): Record<string, TopLevelSectionLayout> {
  return Object.fromEntries(
    Object.entries(topLevelSections).map(([sectionId, layout]) => [
      sectionId,
      { ...layout },
    ]),
  );
}

function copySectionVisibility(
  sectionVisibility: Record<string, boolean>,
): Record<string, boolean> {
  return Object.fromEntries(Object.entries(sectionVisibility));
}

function copyViewport(viewport: Viewport | null): Viewport | null {
  return viewport === null ? null : { ...viewport };
}

function getCurrentDocumentState(host: WorkspaceHost): WorkspaceDocumentState {
  return getWorkspaceDocumentStore(host).getState();
}

function getSavedViewsOrThrow(host: WorkspaceHost): WorkspaceSavedViewsState {
  const savedViews = getCurrentDocumentState(host).savedViews;
  if (savedViews === null) {
    throw new Error(SAVED_VIEWS_DISABLED_REASON);
  }
  return savedViews;
}

function getActiveViewOrThrow(
  savedViews: WorkspaceSavedViewsState,
): WorkspaceSavedView {
  const activeView = savedViews.views[savedViews.activeViewId];
  if (!activeView) {
    throw new Error(
      `Saved views active view ${savedViews.activeViewId} does not exist.`,
    );
  }
  return activeView;
}

function getOperationDisabledReason(
  host: WorkspaceHost,
  operation: WorkspaceSavedViewsOperation,
): string | null {
  if (!SAVED_VIEWS_OPERATIONS.has(operation)) {
    throw new Error(`Unknown saved views operation ${String(operation)}.`);
  }
  const savedViews = getCurrentDocumentState(host).savedViews;
  if (operation === "enable") {
    if (savedViews !== null) {
      return "Saved views are already enabled for this workspace.";
    }
    return getWorkspaceCapabilitiesStore(host).getState().canEditLayout
      ? null
      : SAVED_VIEWS_LAYOUT_DISABLED_REASON;
  }
  if (savedViews === null) {
    return SAVED_VIEWS_DISABLED_REASON;
  }
  if (operation === "activate") {
    return null;
  }
  return getWorkspaceCapabilitiesStore(host).getState().canEditLayout
    ? null
    : SAVED_VIEWS_LAYOUT_DISABLED_REASON;
}

export function getWorkspaceSavedViewsOperationDisabledReason(
  host: WorkspaceHost,
  operation: WorkspaceSavedViewsOperation,
): string | null {
  return getOperationDisabledReason(host, operation);
}

function unavailable(reason: string): WorkspaceSavedViewsOperationResult {
  return { status: "unavailable", reason };
}

function unchanged(
  activeViewId: string,
  viewId: string,
): WorkspaceSavedViewsOperationResult {
  return { status: "unchanged", activeViewId, viewId };
}

function applied(
  activeViewId: string,
  viewId: string,
): WorkspaceSavedViewsOperationResult {
  return { status: "applied", activeViewId, viewId };
}

function reconcileCandidateDocument(
  document: WorkspaceDocumentState,
): WorkspaceDocumentState {
  if (document.savedViews === null) {
    return document;
  }
  const parsed = parseWorkspaceSavedViewsState(document.savedViews);
  const savedViews = reconcileWorkspaceSavedViewsState(parsed, document);
  assertWorkspaceSavedViewsStateForDocument(savedViews, document);
  return savedViews === document.savedViews
    ? document
    : { ...document, savedViews };
}

function pruneActiveSectionIds(
  host: WorkspaceHost,
  document: WorkspaceDocumentState,
  activeIds: Array<string>,
): Array<string> {
  const includeHidden =
    document.savedViews !== null && isWorkspaceSavedViewEditing(host);
  return activeIds.filter(
    (sectionId) =>
      document.sections[sectionId] !== undefined &&
      (includeHidden ||
        isWorkspaceSavedViewSectionVisible(
          document.savedViews,
          document.parentSectionMap,
          sectionId,
        )),
  );
}

function publishSavedViewsDocument(
  host: WorkspaceHost,
  input: SavedViewsPublicationInput,
): void {
  const document = reconcileCandidateDocument(input.document);
  const activeSections = {
    activeIds: pruneActiveSectionIds(
      host,
      document,
      getActiveSectionsStore(host).getState().activeIds,
    ),
  };
  const nodes = createNodesMapFromDocumentChildren(
    host,
    document,
    getNodeInternalsStore(host).getState().x,
    {
      useDocumentLayoutDimensions: input.useDocumentLayoutDimensions,
    },
  );
  if (input.resetInteractions) {
    closeWorkspaceMenu(host, false);
    forceDeactivateDnd(host);
    resetItemDragState(host);
  }
  runWithAtomicallyPublishedWorkspaceStores(
    host,
    {
      document,
      nodeInternals: { x: nodes },
      activeSections,
    },
    () => {
      getNodeInternalsStore(host).setState({ x: nodes });
      getWorkspaceDocumentStore(host).setState(document);
      getActiveSectionsStore(host).setState(activeSections);
    },
  );
  if (input.resetInteractions) {
    manualDndChildrenReset(host);
  }
  if (input.applyViewport) {
    runWithWorkspaceDocumentChangeNotificationsSuppressed(host, () => {
      armLoadedDocumentFitView(host, document.viewport);
      applyLoadedDocumentViewport(host, document.viewport);
      maybeCompleteInitialFitView(host);
    });
  }
  notifyWorkspaceDocumentChange(host, null);
}

function normalizeName(value: unknown, role: string): string {
  if (typeof value !== "string") {
    throw new Error(`${role} must be a string.`);
  }
  const name = value.trim();
  if (name === "") {
    throw new Error(`${role} must be nonblank.`);
  }
  return name;
}

function normalizeId(value: unknown, role: string): string {
  if (typeof value !== "string") {
    throw new Error(`${role} must be a string.`);
  }
  const id = value.trim();
  if (id === "") {
    throw new Error(`${role} must be nonblank.`);
  }
  if (UNSAFE_VIEW_IDS.has(id)) {
    throw new Error(`${role} cannot use the reserved id ${id}.`);
  }
  return id;
}

function resolveNextViewId(savedViews: WorkspaceSavedViewsState): string {
  let index = 1;
  while (Object.hasOwn(savedViews.views, `view-${index}`)) {
    index += 1;
  }
  return `view-${index}`;
}

function resolveNextViewName(savedViews: WorkspaceSavedViewsState): string {
  const names = new Set(
    Object.values(savedViews.views).map((view) => view.name),
  );
  let index = 1;
  while (names.has(`View ${index}`)) {
    index += 1;
  }
  return `View ${index}`;
}

function assertUniqueViewName(
  savedViews: WorkspaceSavedViewsState,
  name: string,
  ignoredViewId: string | null,
): void {
  for (const view of Object.values(savedViews.views)) {
    if (view.id !== ignoredViewId && view.name === name) {
      throw new Error(`Saved view name ${name} is already in use.`);
    }
  }
}

function assertKnownView(
  savedViews: WorkspaceSavedViewsState,
  viewId: unknown,
): WorkspaceSavedView {
  const id = normalizeId(viewId, "Saved view id");
  if (!Object.hasOwn(savedViews.views, id)) {
    throw new Error(`Saved view ${id} does not exist.`);
  }
  const view = savedViews.views[id];
  if (!view) {
    throw new Error(`Saved view ${id} does not exist.`);
  }
  return view;
}

function createReorderedViews(
  savedViews: WorkspaceSavedViewsState,
  orderedViewIds: Array<string>,
): Record<string, WorkspaceSavedView> {
  const views: Record<string, WorkspaceSavedView> = {};
  for (const [sortIndex, viewId] of orderedViewIds.entries()) {
    const view = assertKnownView(savedViews, viewId);
    views[viewId] =
      view.sortIndex === sortIndex ? view : { ...view, sortIndex };
  }
  return views;
}

function prepareWorkspaceSavedViewDeletion(
  savedViews: WorkspaceSavedViewsState,
  view: WorkspaceSavedView,
): WorkspaceSavedViewsDeletion | null {
  const ordered = getOrderedWorkspaceSavedViews(savedViews);
  if (ordered.length === 1) {
    return null;
  }
  const removedIndex = ordered.findIndex((entry) => entry.id === view.id);
  if (removedIndex < 0) {
    throw new Error(`Saved view ${view.id} does not exist.`);
  }
  const retained = ordered.filter((entry) => entry.id !== view.id);
  const activeViewId =
    view.id === savedViews.activeViewId
      ? (ordered[removedIndex + 1] ?? ordered[removedIndex - 1])?.id
      : savedViews.activeViewId;
  if (!activeViewId) {
    throw new Error("Deleting a saved view could not resolve an active view.");
  }
  const nextSavedViews = {
    activeViewId,
    views: createReorderedViews(
      savedViews,
      retained.map((entry) => entry.id),
    ),
  };
  const activeView = nextSavedViews.views[activeViewId];
  if (!activeView) {
    throw new Error(`Saved view ${activeViewId} does not exist.`);
  }
  return {
    activeView,
    activeViewId,
    activated: activeViewId !== savedViews.activeViewId,
    savedViews: nextSavedViews,
  };
}

export function getWorkspaceSavedViewsState(
  host: WorkspaceHost,
): WorkspaceSavedViewsState | null {
  return getCurrentDocumentState(host).savedViews;
}

export function enableWorkspaceSavedViews(
  host: WorkspaceHost,
  input: WorkspaceSavedViewsEnableInput = {},
): WorkspaceSavedViewsOperationResult {
  const reason = getOperationDisabledReason(host, "enable");
  if (reason !== null) {
    return unavailable(reason);
  }
  const current = getCurrentDocumentState(host);
  const savedViews = createWorkspaceSavedViewsState(current, input);
  publishSavedViewsDocument(host, {
    applyViewport: false,
    document: { ...current, savedViews },
    resetInteractions: false,
    useDocumentLayoutDimensions: false,
  });
  return applied(savedViews.activeViewId, savedViews.activeViewId);
}

export function createWorkspaceSavedView(
  host: WorkspaceHost,
  input: WorkspaceSavedViewCreateInput = {},
): WorkspaceSavedViewsOperationResult {
  const reason = getOperationDisabledReason(host, "create");
  if (reason !== null) {
    return unavailable(reason);
  }
  const current = getCurrentDocumentState(host);
  const savedViews = getSavedViewsOrThrow(host);
  const activeView = getActiveViewOrThrow(savedViews);
  const id =
    input.id === undefined
      ? resolveNextViewId(savedViews)
      : normalizeId(input.id, "Saved view id");
  if (savedViews.views[id] !== undefined) {
    throw new Error(`Saved view ${id} already exists.`);
  }
  const name =
    input.name === undefined
      ? resolveNextViewName(savedViews)
      : normalizeName(input.name, "Saved view name");
  assertUniqueViewName(savedViews, name, null);
  const view: WorkspaceSavedView = {
    id,
    name,
    sortIndex: Object.keys(savedViews.views).length,
    topLevelSections: copyTopLevelSections(current.topLevelSections),
    viewport: copyViewport(current.viewport),
    sectionVisibility: copySectionVisibility(activeView.sectionVisibility),
  };
  const nextSavedViews = {
    activeViewId: id,
    views: { ...savedViews.views, [id]: view },
  };
  publishSavedViewsDocument(host, {
    applyViewport: true,
    document: { ...current, savedViews: nextSavedViews },
    resetInteractions: true,
    useDocumentLayoutDimensions: true,
  });
  return applied(id, id);
}

export function activateWorkspaceSavedView(
  host: WorkspaceHost,
  viewId: string,
): WorkspaceSavedViewsOperationResult {
  const reason = getOperationDisabledReason(host, "activate");
  if (reason !== null) {
    return unavailable(reason);
  }
  const current = getCurrentDocumentState(host);
  const savedViews = getSavedViewsOrThrow(host);
  const target = assertKnownView(savedViews, viewId);
  if (target.id === savedViews.activeViewId) {
    return unchanged(target.id, target.id);
  }
  const outgoing = getActiveViewOrThrow(savedViews);
  const nextSavedViews = {
    activeViewId: target.id,
    views: {
      ...savedViews.views,
      [outgoing.id]: {
        ...outgoing,
        topLevelSections: copyTopLevelSections(current.topLevelSections),
        viewport: copyViewport(current.viewport),
      },
    },
  };
  publishSavedViewsDocument(host, {
    applyViewport: true,
    document: {
      ...current,
      savedViews: nextSavedViews,
      topLevelSections: copyTopLevelSections(target.topLevelSections),
      viewport: copyViewport(target.viewport),
    },
    resetInteractions: true,
    useDocumentLayoutDimensions: true,
  });
  return applied(target.id, target.id);
}

export function renameWorkspaceSavedView(
  host: WorkspaceHost,
  viewId: string,
  nextName: string,
): WorkspaceSavedViewsOperationResult {
  const reason = getOperationDisabledReason(host, "rename");
  if (reason !== null) {
    return unavailable(reason);
  }
  const current = getCurrentDocumentState(host);
  const savedViews = getSavedViewsOrThrow(host);
  const view = assertKnownView(savedViews, viewId);
  const name = normalizeName(nextName, "Saved view name");
  if (view.name === name) {
    return unchanged(savedViews.activeViewId, view.id);
  }
  assertUniqueViewName(savedViews, name, view.id);
  publishSavedViewsDocument(host, {
    applyViewport: false,
    document: {
      ...current,
      savedViews: {
        activeViewId: savedViews.activeViewId,
        views: { ...savedViews.views, [view.id]: { ...view, name } },
      },
    },
    resetInteractions: false,
    useDocumentLayoutDimensions: false,
  });
  return applied(savedViews.activeViewId, view.id);
}

export function deleteWorkspaceSavedView(
  host: WorkspaceHost,
  viewId: string,
): WorkspaceSavedViewsOperationResult {
  const reason = getOperationDisabledReason(host, "delete");
  if (reason !== null) {
    return unavailable(reason);
  }
  const current = getCurrentDocumentState(host);
  const savedViews = getSavedViewsOrThrow(host);
  const view = assertKnownView(savedViews, viewId);
  const deletion = prepareWorkspaceSavedViewDeletion(savedViews, view);
  if (deletion === null) {
    return unavailable("The last saved view cannot be deleted.");
  }
  publishSavedViewsDocument(host, {
    applyViewport: deletion.activated,
    document: deletion.activated
      ? {
          ...current,
          savedViews: deletion.savedViews,
          topLevelSections: copyTopLevelSections(
            deletion.activeView.topLevelSections,
          ),
          viewport: copyViewport(deletion.activeView.viewport),
        }
      : { ...current, savedViews: deletion.savedViews },
    resetInteractions: deletion.activated,
    useDocumentLayoutDimensions: deletion.activated,
  });
  return applied(deletion.activeViewId, view.id);
}

export function reorderWorkspaceSavedView(
  host: WorkspaceHost,
  viewId: string,
  sortIndex: number,
): WorkspaceSavedViewsOperationResult {
  const reason = getOperationDisabledReason(host, "reorder");
  if (reason !== null) {
    return unavailable(reason);
  }
  const current = getCurrentDocumentState(host);
  const savedViews = getSavedViewsOrThrow(host);
  const view = assertKnownView(savedViews, viewId);
  if (
    !Number.isInteger(sortIndex) ||
    sortIndex < 0 ||
    sortIndex >= Object.keys(savedViews.views).length
  ) {
    throw new Error("Saved view sort index must select an existing position.");
  }
  if (view.sortIndex === sortIndex) {
    return unchanged(savedViews.activeViewId, view.id);
  }
  const orderedViewIds = getOrderedWorkspaceSavedViews(savedViews)
    .filter((entry) => entry.id !== view.id)
    .map((entry) => entry.id);
  orderedViewIds.splice(sortIndex, 0, view.id);
  publishSavedViewsDocument(host, {
    applyViewport: false,
    document: {
      ...current,
      savedViews: {
        activeViewId: savedViews.activeViewId,
        views: createReorderedViews(savedViews, orderedViewIds),
      },
    },
    resetInteractions: false,
    useDocumentLayoutDimensions: false,
  });
  return applied(savedViews.activeViewId, view.id);
}

export function setWorkspaceSavedViewSectionVisibility(
  host: WorkspaceHost,
  sectionIds: ReadonlyArray<string>,
  visible: boolean,
): WorkspaceSavedViewsOperationResult {
  const reason = getOperationDisabledReason(host, "visibility");
  if (reason !== null) {
    return unavailable(reason);
  }
  if (typeof visible !== "boolean") {
    throw new Error("Saved view visibility must be boolean.");
  }
  const current = getCurrentDocumentState(host);
  const savedViews = getSavedViewsOrThrow(host);
  const activeView = getActiveViewOrThrow(savedViews);
  const uniqueSectionIds = [...new Set(sectionIds)];
  for (const sectionId of uniqueSectionIds) {
    if (
      typeof sectionId !== "string" ||
      current.sections[sectionId] === undefined
    ) {
      throw new Error(
        `Saved view visibility references unknown section ${String(sectionId)}.`,
      );
    }
  }
  if (
    uniqueSectionIds.length === 0 ||
    uniqueSectionIds.every(
      (sectionId) => activeView.sectionVisibility[sectionId] === visible,
    )
  ) {
    return unchanged(savedViews.activeViewId, savedViews.activeViewId);
  }
  const sectionVisibility = copySectionVisibility(activeView.sectionVisibility);
  for (const sectionId of uniqueSectionIds) {
    sectionVisibility[sectionId] = visible;
  }
  publishSavedViewsDocument(host, {
    applyViewport: false,
    document: {
      ...current,
      savedViews: {
        activeViewId: savedViews.activeViewId,
        views: {
          ...savedViews.views,
          [activeView.id]: { ...activeView, sectionVisibility },
        },
      },
    },
    resetInteractions: true,
    useDocumentLayoutDimensions: false,
  });
  return applied(savedViews.activeViewId, savedViews.activeViewId);
}
