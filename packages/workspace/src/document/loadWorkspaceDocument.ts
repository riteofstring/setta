import {
  applyLoadedDocumentViewport,
  armLoadedDocumentFitView,
} from "../canvas/documentViewportSync";
import { maybeCompleteInitialFitView } from "../canvas/nodeInternalsActions";
import { closeWorkspaceMenu } from "../context-menu/workspaceMenuState";
import { resetDndSessionForLoadedDocument } from "../dnd/dndState";
import { resetItemDragState } from "../items/itemDragHandlers";
import { deriveSectionStyleTheme } from "../section/sectionStyleColors";
import { normalizeSectionTagColor } from "../section/sectionTagColors";
import {
  getWorkspaceDocument,
  notifyWorkspaceDocumentChange,
  runWithWorkspaceDocumentChangeNotificationsSuppressed,
} from "./documentChangeCallback";
import { synchronizeWorkspaceHistory } from "../history/workspaceHistory";
import { isGroupSection } from "./documentSelectors";
import { assertValidSectionOverflowMode } from "./groupOverflow";
import { deactivateItemSelect } from "./itemSelectionMode";
import { assertValidWorkspaceSectionItemTree } from "./itemTreeValidation";
import { createNodesMapFromDocumentChildren } from "./nodeProjection";
import {
  canWorkspaceSectionAcceptNestedSection,
  canWorkspaceSectionOwnNestedSections,
  getRegisteredSectionKindOrThrow,
  getWorkspaceItemAreaPresentationOrThrow,
} from "./sectionKindRegistry";
import { resolveWorkspaceSectionSize } from "./sectionSize";
import {
  assertWorkspaceSavedViewsStateForDocument,
  isWorkspaceSavedViewSectionVisible,
  parseWorkspaceSavedViewsState,
  reconcileWorkspaceSavedViewsState,
} from "../saved-views/state";
import {
  getActiveSectionsStore,
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
  runWithAtomicallyPublishedWorkspaceStores,
  type NodeInternalsState,
  type WorkspaceDocumentState,
} from "./stores";
import type { WorkspaceHistoryChangeKind } from "../history/workspaceHistoryTypes";
import type { WorkspaceHost } from "../workspaceHost";
import type {
  WorkspaceDocumentInput,
  WorkspaceSection,
  WorkspaceSectionInput,
} from "./types";
import { setWorkspaceSavedViewEditingState } from "../saved-views/editingState";

const SECTION_STYLE_COLOR_PATTERN = /^#?[0-9a-f]{6}$/iu;

function getOwnRecordValue<Value>(
  record: Record<string, Value>,
  key: string,
): Value | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function resolveLoadedSections(
  host: WorkspaceHost,
  sections: Record<string, WorkspaceSectionInput>,
): Record<string, WorkspaceSection> {
  const resolved = Object.create(null) as Record<string, WorkspaceSection>;
  for (const [sectionId, section] of Object.entries(sections)) {
    if (!isGroupSection(section)) {
      getRegisteredSectionKindOrThrow(host, section.kind);
    }
    resolved[sectionId] = {
      ...section,
      tagColor: normalizeSectionTagColor(
        section.tagColor,
        `Section ${sectionId} tag color`,
      ),
      size: resolveWorkspaceSectionSize(host, section),
    };
  }
  return resolved;
}

function assertValidRegisteredSectionData(
  host: WorkspaceHost,
  sections: Record<string, WorkspaceSection>,
) {
  for (const section of Object.values(sections)) {
    if (isGroupSection(section)) {
      continue;
    }
    getRegisteredSectionKindOrThrow(host, section.kind).assertValidData?.(
      section,
    );
  }
}

function assertValidSectionStyleColors(
  sections: Record<string, WorkspaceSection>,
) {
  for (const [sectionId, section] of Object.entries(sections)) {
    const styleColor = section.styleColor;
    if (
      styleColor !== null &&
      styleColor.trim() !== "" &&
      (!SECTION_STYLE_COLOR_PATTERN.test(styleColor.trim()) ||
        deriveSectionStyleTheme(styleColor, false) === null)
    ) {
      throw new Error(
        `Section ${sectionId} has an unparseable style color ${styleColor}.`,
      );
    }
  }
}

function assertValidSectionOverflowModes(
  sections: Record<string, WorkspaceSection>,
) {
  for (const [sectionId, section] of Object.entries(sections)) {
    assertValidSectionOverflowMode(sectionId, section);
  }
}

function buildParentSectionMap(
  host: WorkspaceHost,
  sections: Record<string, WorkspaceSection>,
): Record<string, string> {
  const parentSectionMap = Object.create(null) as Record<string, string>;
  for (const [sectionId, section] of Object.entries(sections)) {
    if (section.id !== sectionId) {
      throw new Error(
        `Section record key ${sectionId} does not match section id ${section.id}.`,
      );
    }
    if (
      section.children.length > 0 &&
      !canWorkspaceSectionOwnNestedSections(host, section)
    ) {
      throw new Error(`Section ${sectionId} cannot own nested sections.`);
    }
    for (const childId of section.children) {
      const child = getOwnRecordValue(sections, childId);
      if (!child) {
        throw new Error(`Section ${sectionId} lists unknown child ${childId}.`);
      }
      if (!canWorkspaceSectionAcceptNestedSection(host, section, child)) {
        throw new Error(`Section ${childId} cannot be nested in ${sectionId}.`);
      }
      const existingParentId = getOwnRecordValue(parentSectionMap, childId);
      if (existingParentId !== undefined) {
        throw new Error(
          `Section ${childId} is claimed by parents ${existingParentId} and ${sectionId}.`,
        );
      }
      parentSectionMap[childId] = sectionId;
    }
  }
  return parentSectionMap;
}

function assertAcyclicParentChains(parentSectionMap: Record<string, string>) {
  for (const startId of Object.keys(parentSectionMap)) {
    const visited = new Set<string>([startId]);
    let parentId = getOwnRecordValue(parentSectionMap, startId) ?? null;
    while (parentId !== null) {
      if (visited.has(parentId)) {
        throw new Error(`Section ${startId} has a cyclic parent chain.`);
      }
      visited.add(parentId);
      parentId = getOwnRecordValue(parentSectionMap, parentId) ?? null;
    }
  }
}

function assertValidSectionItemTrees(
  host: WorkspaceHost,
  sections: Record<string, WorkspaceSection>,
) {
  for (const [sectionId, section] of Object.entries(sections)) {
    if (!section.itemTree) {
      continue;
    }

    if (isGroupSection(section)) {
      throw new Error(
        `Section ${sectionId} is a group section and cannot carry an item tree.`,
      );
    }

    getWorkspaceItemAreaPresentationOrThrow(host, section);
    assertValidWorkspaceSectionItemTree(sectionId, section.itemTree);
  }
}

function assertKnownSectionIds(
  document: WorkspaceDocumentInput,
  ids: Iterable<string>,
  role: string,
) {
  for (const sectionId of ids) {
    if (!Object.hasOwn(document.sections, sectionId)) {
      throw new Error(`${role} references unknown section ${sectionId}.`);
    }
  }
}

type PreparedWorkspaceDocumentCommit = {
  activeSections: { activeIds: Array<string> };
  document: WorkspaceDocumentState;
  nodeInternals: NodeInternalsState;
};

function prepareWorkspaceDocumentCommit(
  host: WorkspaceHost,
  document: WorkspaceDocumentInput,
  options: { includeHiddenSections?: boolean } = {},
): PreparedWorkspaceDocumentCommit {
  const { sections, parentSectionMap } = resolveAndValidateWorkspaceSections(
    host,
    document.sections,
  );
  assertKnownSectionIds(
    document,
    Object.keys(document.topLevelSections),
    "Top-level layout",
  );
  assertKnownSectionIds(document, document.activeIds, "Active ids");

  const savedViews =
    document.savedViews === null
      ? null
      : reconcileWorkspaceSavedViewsState(
          parseWorkspaceSavedViewsState(document.savedViews),
          {
            sections,
            topLevelSections: document.topLevelSections,
            viewport: document.viewport,
          },
        );
  if (savedViews !== null) {
    assertWorkspaceSavedViewsStateForDocument(savedViews, {
      sections,
      topLevelSections: document.topLevelSections,
      viewport: document.viewport,
    });
  }

  const nextDocumentState: WorkspaceDocumentState = {
    sections,
    topLevelSections: document.topLevelSections,
    viewport: document.viewport,
    parentSectionMap,
    savedViews,
  };
  const nextNodesMap = createNodesMapFromDocumentChildren(
    host,
    nextDocumentState,
    getNodeInternalsStore(host).getState().x,
    options,
  );
  return {
    activeSections: {
      activeIds: document.activeIds.filter((sectionId) =>
        isWorkspaceSavedViewSectionVisible(
          savedViews,
          parentSectionMap,
          sectionId,
        ),
      ),
    },
    document: nextDocumentState,
    nodeInternals: { x: nextNodesMap },
  };
}

function publishPreparedWorkspaceDocument(
  host: WorkspaceHost,
  prepared: PreparedWorkspaceDocumentCommit,
): void {
  runWithAtomicallyPublishedWorkspaceStores(host, prepared, () => {
    getNodeInternalsStore(host).setState(prepared.nodeInternals);

    getWorkspaceDocumentStore(host).setState(prepared.document);
    getActiveSectionsStore(host).setState(prepared.activeSections);
  });
}

export function commitWorkspaceDocument(
  host: WorkspaceHost,
  document: WorkspaceDocumentInput,
): void {
  const prepared = prepareWorkspaceDocumentCommit(host, document);
  publishPreparedWorkspaceDocument(host, prepared);
  synchronizeWorkspaceHistory(host, "projection", getWorkspaceDocument(host));
  notifyWorkspaceDocumentChange(host, null);
}

export function commitWorkspaceDocumentMutation(
  host: WorkspaceHost,
  document: WorkspaceDocumentInput,
  historyChangeKind: WorkspaceHistoryChangeKind,
): void {
  const prepared = prepareWorkspaceDocumentCommit(host, document);
  publishPreparedWorkspaceDocument(host, prepared);
  notifyWorkspaceDocumentChange(host, historyChangeKind);
}

export function replayWorkspaceHistoryDocument(
  host: WorkspaceHost,
  document: WorkspaceDocumentInput,
): void {
  const prepared = prepareWorkspaceDocumentCommit(host, document);
  publishPreparedWorkspaceDocument(host, prepared);
  notifyWorkspaceDocumentChange(host, null);
}

export function resolveAndValidateWorkspaceSections(
  host: WorkspaceHost,
  sectionInputs: Record<string, WorkspaceSectionInput>,
): {
  sections: Record<string, WorkspaceSection>;
  parentSectionMap: Record<string, string>;
} {
  const sections = resolveLoadedSections(host, sectionInputs);
  assertValidRegisteredSectionData(host, sections);
  assertValidSectionStyleColors(sections);
  assertValidSectionOverflowModes(sections);
  const parentSectionMap = buildParentSectionMap(host, sections);
  assertAcyclicParentChains(parentSectionMap);
  assertValidSectionItemTrees(host, sections);
  return { sections, parentSectionMap };
}

export function loadWorkspaceDocument(
  host: WorkspaceHost,
  document: WorkspaceDocumentInput,
): void {
  const prepared = prepareWorkspaceDocumentCommit(host, document, {
    includeHiddenSections: false,
  });

  closeWorkspaceMenu(host, false);
  setWorkspaceSavedViewEditingState(host, false);
  runWithWorkspaceDocumentChangeNotificationsSuppressed(host, () => {
    armLoadedDocumentFitView(host, document.viewport);
    publishPreparedWorkspaceDocument(host, prepared);
    resetDndSessionForLoadedDocument(
      host,
      new Set(Object.keys(document.sections)),
    );

    resetItemDragState(host);
    deactivateItemSelect(host);
    applyLoadedDocumentViewport(host, document.viewport);
  });
  synchronizeWorkspaceHistory(host, "load", getWorkspaceDocument(host));
  notifyWorkspaceDocumentChange(host, null);

  maybeCompleteInitialFitView(host);
}
