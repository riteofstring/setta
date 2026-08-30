import { matchSorter } from "match-sorter";
import { getSectionRect } from "../canvas/graph";
import { focusWorkspaceSection } from "../canvas/viewportHelpers";
import { getReactFlowStore } from "../canvas/store";
import { getWorkspaceXyflowRuntime } from "../canvas/xyflow/workspaceXyflowRuntime";
import {
  getVisibleSectionChildrenForDisplay,
  getVisibleTopLevelSectionIdsForDisplay,
  isWorkspaceSectionVisible,
} from "../document/savedViewDisplay";
import { getItemOrThrow } from "../document/itemTree";
import {
  getWorkspaceItemSearchableText,
  getWorkspaceSectionSearchableText,
} from "../document/sectionKindRegistry";
import {
  getWorkspaceDocumentStore,
  type WorkspaceDocumentState,
} from "../document/stores";
import type { WorkspaceItem, WorkspaceSection } from "../document/types";
import type { WorkspaceHost } from "../workspaceHost";
import type { WorkspaceNavigatorActivation } from "./workspaceNavigatorTypes";
import { revealWorkspaceItem } from "./workspaceItemReveal";

type WorkspaceFindSectionResult = Readonly<{
  activate: () => WorkspaceNavigatorActivation;
  breadcrumb: string | null;
  checked: null;
  disabled: false;
  disabledReason: null;
  group: "Sections";
  id: string;
  kind: "section";
  label: string;
  searchableText: string;
  sectionId: string;
  sectionKind: string;
  shortcutLabel: null;
}>;

type WorkspaceFindItemResult = Readonly<{
  activate: () => WorkspaceNavigatorActivation;
  breadcrumb: string | null;
  checked: null;
  disabled: false;
  disabledReason: null;
  group: "Items";
  id: string;
  itemId: string;
  kind: "item";
  label: string;
  searchableText: string;
  sectionId: string;
  sectionKind: string;
  shortcutLabel: null;
}>;

type WorkspaceFindResult = WorkspaceFindSectionResult | WorkspaceFindItemResult;

function joinWorkspaceFindSearchableText(parts: Array<string>): string {
  return parts.filter((part) => part !== "").join("\n");
}

function createWorkspaceFindBreadcrumb(parts: Array<string>): string | null {
  return parts.length === 0 ? null : parts.join(" / ");
}

function createWorkspaceFindSectionResult({
  host,
  section,
  ancestorNames,
}: {
  host: WorkspaceHost;
  section: WorkspaceSection;
  ancestorNames: Array<string>;
}): WorkspaceFindSectionResult {
  return {
    activate: () => activateWorkspaceFindSection(host, section.id),
    breadcrumb: createWorkspaceFindBreadcrumb(ancestorNames),
    checked: null,
    disabled: false,
    disabledReason: null,
    group: "Sections",
    id: `section:${section.id}`,
    kind: "section",
    label: section.name,
    searchableText: joinWorkspaceFindSearchableText([
      section.name,
      section.kind,
      getWorkspaceSectionSearchableText(host, section),
    ]),
    sectionId: section.id,
    sectionKind: section.kind,
    shortcutLabel: null,
  };
}

function getWorkspaceFindItemLabel(item: WorkspaceItem): string {
  return item.presentation?.label ?? item.id;
}

function createWorkspaceFindItemResult({
  host,
  section,
  item,
  itemAncestorLabels,
  sectionBreadcrumb,
}: {
  host: WorkspaceHost;
  section: WorkspaceSection;
  item: WorkspaceItem;
  itemAncestorLabels: Array<string>;
  sectionBreadcrumb: Array<string>;
}): WorkspaceFindItemResult {
  return {
    activate: () => activateWorkspaceFindItem(host, section.id, item.id),
    breadcrumb: createWorkspaceFindBreadcrumb([
      ...sectionBreadcrumb,
      ...itemAncestorLabels,
    ]),
    checked: null,
    disabled: false,
    disabledReason: null,
    group: "Items",
    id: `item:${section.id}:${item.id}`,
    itemId: item.id,
    kind: "item",
    label: getWorkspaceFindItemLabel(item),
    searchableText: joinWorkspaceFindSearchableText([
      getWorkspaceFindItemLabel(item),
      getWorkspaceItemSearchableText(host, section, item),
    ]),
    sectionId: section.id,
    sectionKind: section.kind,
    shortcutLabel: null,
  };
}

function collectWorkspaceFindItems(
  host: WorkspaceHost,
  section: WorkspaceSection,
  sectionBreadcrumb: Array<string>,
): Array<WorkspaceFindItemResult> {
  const itemTree = section.itemTree;
  if (!itemTree) {
    return [];
  }
  const resolvedItemTree = itemTree;
  const results: Array<WorkspaceFindItemResult> = [];

  function visit(itemId: string, itemAncestorLabels: Array<string>): void {
    const item = getItemOrThrow(resolvedItemTree, itemId);
    results.push(
      createWorkspaceFindItemResult({
        host,
        section,
        item,
        itemAncestorLabels,
        sectionBreadcrumb,
      }),
    );
    const nextAncestorLabels = [
      ...itemAncestorLabels,
      getWorkspaceFindItemLabel(item),
    ];
    for (const childId of item.children) {
      visit(childId, nextAncestorLabels);
    }
  }

  for (const itemId of getItemOrThrow(resolvedItemTree, resolvedItemTree.rootId)
    .children) {
    visit(itemId, []);
  }
  return results;
}

function collectWorkspaceFindResults(
  host: WorkspaceHost,
  state: WorkspaceDocumentState,
): Array<WorkspaceFindResult> {
  const results: Array<WorkspaceFindResult> = [];

  function visit(sectionId: string, ancestorNames: Array<string>): void {
    const section = state.sections[sectionId];
    if (!section) {
      throw new Error(
        `Workspace find encountered unknown section ${sectionId}.`,
      );
    }
    results.push(
      createWorkspaceFindSectionResult({ host, section, ancestorNames }),
    );
    const sectionBreadcrumb = [...ancestorNames, section.name];
    results.push(
      ...collectWorkspaceFindItems(host, section, sectionBreadcrumb),
    );
    for (const childId of getVisibleSectionChildrenForDisplay(
      state,
      sectionId,
    )) {
      visit(childId, sectionBreadcrumb);
    }
  }

  for (const sectionId of getVisibleTopLevelSectionIdsForDisplay(state)) {
    visit(sectionId, []);
  }
  return results;
}

function getWorkspaceFindSectionDocumentUnavailableMessage(
  documentState: WorkspaceDocumentState,
  sectionId: string,
): string | null {
  if (!documentState.sections[sectionId]) {
    return "This result is no longer available.";
  }
  if (!isWorkspaceSectionVisible(documentState, sectionId)) {
    return "This section is hidden in the active saved view.";
  }
  return null;
}

function getWorkspaceFindSectionBoundsUnavailableMessage(
  host: WorkspaceHost,
  sectionId: string,
): string | null {
  const sectionRect = getSectionRect(host, sectionId);
  if (!sectionRect) {
    return "This section is not currently mounted.";
  }
  if (sectionRect.width <= 0 || sectionRect.height <= 0) {
    return "This section has no visible bounds.";
  }
  return null;
}

function getWorkspaceFindCanvasUnavailableMessage(
  host: WorkspaceHost,
): string | null {
  const { height, width } = getReactFlowStore(host).getState();
  if (!getWorkspaceXyflowRuntime(host).getInstance()) {
    return "The workspace canvas is not ready.";
  }
  if (width <= 0 || height <= 0) {
    return "The workspace canvas has no visible bounds.";
  }
  return null;
}

function getWorkspaceFindSectionFocusUnavailableMessage(
  host: WorkspaceHost,
  sectionId: string,
): string | null {
  const documentUnavailableMessage =
    getWorkspaceFindSectionDocumentUnavailableMessage(
      getWorkspaceDocumentStore(host).getState(),
      sectionId,
    );
  if (documentUnavailableMessage) {
    return documentUnavailableMessage;
  }
  const boundsUnavailableMessage =
    getWorkspaceFindSectionBoundsUnavailableMessage(host, sectionId);
  if (boundsUnavailableMessage) {
    return boundsUnavailableMessage;
  }
  return getWorkspaceFindCanvasUnavailableMessage(host);
}

function activateWorkspaceFindSection(
  host: WorkspaceHost,
  sectionId: string,
): WorkspaceNavigatorActivation {
  const unavailableMessage = getWorkspaceFindSectionFocusUnavailableMessage(
    host,
    sectionId,
  );
  if (unavailableMessage) {
    return { ran: false, statusMessage: unavailableMessage };
  }
  focusWorkspaceSection(host, sectionId);
  return { ran: true, statusMessage: null };
}

function hasLiveWorkspaceFindItem(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
): boolean {
  const documentState = getWorkspaceDocumentStore(host).getState();
  const section = documentState.sections[sectionId];
  const itemTree = section?.itemTree;
  return Boolean(
    isWorkspaceSectionVisible(documentState, sectionId) &&
    itemTree &&
    itemId !== itemTree.rootId &&
    itemTree.items[itemId],
  );
}

function activateWorkspaceFindItem(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
): WorkspaceNavigatorActivation {
  if (!hasLiveWorkspaceFindItem(host, sectionId, itemId)) {
    return { ran: false, statusMessage: "This result is no longer available." };
  }
  const sectionActivation = activateWorkspaceFindSection(host, sectionId);
  if (!sectionActivation.ran) {
    return sectionActivation;
  }
  const reveal = revealWorkspaceItem(host, sectionId, itemId);
  return reveal.revealed
    ? { ran: true, statusMessage: null }
    : { ran: true, statusMessage: reveal.statusMessage };
}

export function buildWorkspaceFindResults(
  host: WorkspaceHost,
): Array<WorkspaceFindResult> {
  return collectWorkspaceFindResults(
    host,
    getWorkspaceDocumentStore(host).getState(),
  );
}

export function resolveWorkspaceFindResults(
  host: WorkspaceHost,
  query = "",
): Array<WorkspaceFindResult> {
  if (typeof query !== "string") {
    throw new Error("Workspace find query must be a string.");
  }
  const results = buildWorkspaceFindResults(host);
  const normalizedQuery = query.trim();
  if (normalizedQuery === "") {
    return results;
  }
  return matchSorter(results, normalizedQuery, {
    baseSort: (left, right) => left.index - right.index,
    keys: ["searchableText"],
  });
}
