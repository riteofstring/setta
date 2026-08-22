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
  notifyWorkspaceDocumentSubscribers,
  runWithWorkspaceDocumentChangeNotificationsSuppressed,
} from "./documentChangeCallback";
import { isGroupSection } from "./documentSelectors";
import { assertValidSectionOverflowMode } from "./groupOverflow";
import { deactivateItemSelect } from "./itemSelectionMode";
import { assertValidWorkspaceSectionItemTree } from "./itemTreeValidation";
import { createNodesMapFromDocumentChildren } from "./nodeProjection";
import { getRegisteredSectionKindOrThrow } from "./sectionKindRegistry";
import { resolveWorkspaceSectionSize } from "./sectionSize";
import {
  getActiveSectionsStore,
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
  runWithAtomicallyPublishedWorkspaceStores,
  type WorkspaceDocumentState,
} from "./stores";
import type { WorkspaceHost } from "../workspaceHost";
import type {
  WorkspaceDocumentInput,
  WorkspaceSection,
  WorkspaceSectionInput,
} from "./types";

const SECTION_STYLE_COLOR_PATTERN = /^#?[0-9a-f]{6}$/iu;

function resolveLoadedSections(
  host: WorkspaceHost,
  sections: Record<string, WorkspaceSectionInput>,
): Record<string, WorkspaceSection> {
  const resolved: Record<string, WorkspaceSection> = {};
  for (const [sectionId, section] of Object.entries(sections)) {
    // Every non-group kind must be registered before its documents load, whether or not the
    // section carries its own size for the size resolution below to use.
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

// The registered-kind data boundary: a kind that owns a real `data` shape parses it here, once,
// before the resolved sections reach the stores.
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
  sections: Record<string, WorkspaceSection>,
): Record<string, string> {
  const parentSectionMap: Record<string, string> = {};
  for (const [sectionId, section] of Object.entries(sections)) {
    if (section.id !== sectionId) {
      throw new Error(
        `Section record key ${sectionId} does not match section id ${section.id}.`,
      );
    }
    for (const childId of section.children) {
      if (!(childId in sections)) {
        throw new Error(`Section ${sectionId} lists unknown child ${childId}.`);
      }
      const existingParentId = parentSectionMap[childId];
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
    let parentId = parentSectionMap[startId] ?? null;
    while (parentId !== null) {
      if (visited.has(parentId)) {
        throw new Error(`Section ${startId} has a cyclic parent chain.`);
      }
      visited.add(parentId);
      parentId = parentSectionMap[parentId] ?? null;
    }
  }
}

function assertValidSectionItemTrees(
  sections: Record<string, WorkspaceSection>,
) {
  for (const [sectionId, section] of Object.entries(sections)) {
    if (!section.itemTree) {
      continue;
    }
    // The reference cannot represent params on a Group (its section-click policy guards on
    // `isBaseSectionWithParamsImpl`), so a group section never carries an item tree.
    if (isGroupSection(section)) {
      throw new Error(
        `Section ${sectionId} is a group section and cannot carry an item tree.`,
      );
    }
    assertValidWorkspaceSectionItemTree(sectionId, section.itemTree);
  }
}

function assertKnownSectionIds(
  document: WorkspaceDocumentInput,
  ids: Iterable<string>,
  role: string,
) {
  for (const sectionId of ids) {
    if (!(sectionId in document.sections)) {
      throw new Error(`${role} references unknown section ${sectionId}.`);
    }
  }
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
  const parentSectionMap = buildParentSectionMap(sections);
  assertAcyclicParentChains(parentSectionMap);
  assertValidSectionItemTrees(sections);
  return { sections, parentSectionMap };
}

// Replaces the canonical workspace state with a host-supplied document. The document, its
// derived node geometry, and the selection publish atomically so no subscriber observes a
// mixture of old and new state. The whole load suppresses intermediate notifications and emits
// one completed host snapshot after the replacement finishes.
//
// This file is the deliberate composition point between the document layer and the canvas/dnd
// runtimes: a load on a mounted canvas re-applies the loaded camera (or re-arms fit-on-init)
// and resets the drag-session bookkeeping, replacing the Phase 1 load-before-mount-only seam.
// The funnel modules themselves stay canvas-free.
export function loadWorkspaceDocument(
  host: WorkspaceHost,
  document: WorkspaceDocumentInput,
): void {
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

  const nextDocumentState: WorkspaceDocumentState = {
    sections,
    topLevelSections: document.topLevelSections,
    viewport: document.viewport,
    parentSectionMap,
  };
  const nextNodesMap = createNodesMapFromDocumentChildren(
    host,
    nextDocumentState,
    getNodeInternalsStore(host).getState().x,
  );
  const nextActiveSections = { activeIds: document.activeIds };
  // A menu context is an immutable snapshot of the outgoing document. Release it only after the
  // incoming document validates, and do not restore focus into the surface being replaced.
  closeWorkspaceMenu(host, false);
  runWithWorkspaceDocumentChangeNotificationsSuppressed(host, () => {
    // Arming precedes the publication so the sync mirror fired by the flag flip lands in the
    // outgoing document state, leaving the loaded null viewport intact.
    armLoadedDocumentFitView(host, document.viewport);
    runWithAtomicallyPublishedWorkspaceStores(
      host,
      {
        document: nextDocumentState,
        nodeInternals: { x: nextNodesMap },
        activeSections: nextActiveSections,
      },
      () => {
        getNodeInternalsStore(host).setState({ x: nextNodesMap });
        // The stores used below share the host-scoped atomic staging above.
        getWorkspaceDocumentStore(host).setState(nextDocumentState);
        getActiveSectionsStore(host).setState(nextActiveSections);
      },
    );
    resetDndSessionForLoadedDocument(
      host,
      new Set(Object.keys(document.sections)),
    );
    // The item half of the drag-session reset: a load replaces the document the item drag
    // bookkeeping references, and item-select mode releases like the held section dnd modes.
    resetItemDragState(host);
    deactivateItemSelect(host);
    applyLoadedDocumentViewport(host, document.viewport);
  });
  notifyWorkspaceDocumentSubscribers(host);
  // Outside the suppression: when surviving measurements let the armed fit complete
  // immediately, the fitted camera mirrors into the document and notifies the host — the same
  // canonical change the host would see when a ResizeObserver pass completes the fit later.
  maybeCompleteInitialFitView(host);
}
