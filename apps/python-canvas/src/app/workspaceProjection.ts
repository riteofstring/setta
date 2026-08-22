import {
  WORKSPACE_CODE_SECTION_KIND,
  commitWorkspaceDocument,
  createWorkspaceCodeSectionData,
  getWorkspaceCodeSectionData,
  setItemData,
  type WorkspaceCodeSectionDiagnostic,
  type WorkspaceDocument,
  type WorkspaceHost,
  type WorkspaceItem,
  type WorkspaceItemDiagnostic,
  type WorkspaceSection,
  type WorkspaceSectionInput,
  type WorkspaceSectionItemTree,
} from "@setta/workspace";

import {
  DIAGNOSTIC_SEVERITY_INFORMATION_V2,
  DICTIONARY_ENTRY_KIND_LEAF_V2,
  DICTIONARY_ENTRY_KIND_PARENT_V2,
  PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2,
  type CallableV2,
  type DiagnosticV2,
  type DictionaryEntryV2,
  type ListV2,
  type ParameterDictionaryV2,
  type ParameterV2,
  type ProjectSnapshotV2,
} from "../backend/generatedContract";
import {
  type CallableSectionData,
  type ParameterItemData,
  readParameterItemData,
} from "../sections/CallableSection";
import {
  type DictionaryEntryItemData,
  type ParameterDictionarySectionData,
  readDictionaryEntryItemData,
} from "../sections/ParamDictSection";
import { type ListSectionData } from "../sections/ListSection";

export const CALLABLE_SECTION_KIND = "python-canvas.callable" as const;
export const PENDING_CALLABLE_SECTION_KIND =
  "python-canvas.callable-pending" as const;
export const PARAMETER_DICTIONARY_SECTION_KIND =
  "python-canvas.parameter-dictionary" as const;
export const PENDING_PARAMETER_DICTIONARY_SECTION_KIND =
  "python-canvas.parameter-dictionary-pending" as const;
export const LIST_SECTION_KIND = "python-canvas.list" as const;
export const PENDING_LIST_SECTION_KIND = "python-canvas.list-pending" as const;
export const GENERATED_PYTHON_SECTION_ID =
  "python-canvas:generated-python" as const;

export const CALLABLE_SECTION_SIZE = { width: 360, height: 300 } as const;
export const PARAMETER_DICTIONARY_SECTION_SIZE = {
  width: 420,
  height: 300,
} as const;
export const LIST_SECTION_SIZE = { width: 360, height: 144 } as const;
export const GENERATED_PYTHON_SECTION_SIZE = {
  width: 640,
  height: 420,
} as const;

const generatedCodeSeparator = "\n\n";
const parameterWorkspaceItemPrefix = "python-canvas:parameter-item:";
const dictionaryEntryWorkspaceItemPrefix =
  "python-canvas:dictionary-entry-item:";

type ProjectSectionDescriptor =
  | {
      callable: CallableV2;
      canonicalId: string;
      kind: "callable";
      workspaceId: string;
    }
  | {
      canonicalId: string;
      dictionary: ParameterDictionaryV2;
      kind: "dictionary";
      workspaceId: string;
    }
  | {
      canonicalId: string;
      kind: "list";
      list: ListV2;
      workspaceId: string;
    };

export type ProjectSnapshotProjectionOptions = Readonly<{
  keepAuthoredPython: boolean;
  keepDictionaryEntries: ReadonlySet<string>;
  keepParameterLists: ReadonlySet<string>;
  // Creation returns a short-lived local section before the canonical server
  // identity is known. Reconcile that placeholder in place on its response.
  pendingSectionIds: ReadonlyMap<string, string>;
}>;

export function callableSectionID(callableId: string): string {
  return `python-canvas:callable:${callableId}`;
}

export function parameterDictionarySectionID(dictionaryId: string): string {
  return `python-canvas:parameter-dictionary:${dictionaryId}`;
}

export function listSectionID(listId: string): string {
  return `python-canvas:list:${listId}`;
}

function parameterItemRootID(callableId: string): string {
  return `${callableSectionID(callableId)}:parameter-root`;
}

function dictionaryEntryRootID(dictionaryId: string): string {
  return `${parameterDictionarySectionID(dictionaryId)}:entry-root`;
}

// Canonical IDs are opaque application data. Their workspace structural
// counterparts live in disjoint namespaces, including the two item roots.
export function parameterWorkspaceItemID(parameterId: string): string {
  return `${parameterWorkspaceItemPrefix}${encodeURIComponent(parameterId)}`;
}

export function dictionaryEntryWorkspaceItemID(entryId: string): string {
  return `${dictionaryEntryWorkspaceItemPrefix}${encodeURIComponent(entryId)}`;
}

export function createPendingCallableSection(
  snapshot: Pick<ProjectSnapshotV2, "providerStatus">,
  sectionId: string,
  name: string,
): WorkspaceSectionInput {
  const rootId = parameterItemRootID(sectionId);
  return {
    ...ordinarySectionInput({
      data: pendingCallableSectionData(snapshot, sectionId, name),
      id: sectionId,
      kind: PENDING_CALLABLE_SECTION_KIND,
      name,
      size: CALLABLE_SECTION_SIZE,
    }),
    positionAndSizeLocked: true,
    itemTree: {
      rootId,
      items: { [rootId]: { id: rootId, children: [] } },
      selectedItemIds: [],
    },
  };
}

export function createPendingParameterDictionarySection(
  sectionId: string,
  name: string,
): WorkspaceSectionInput {
  const rootId = dictionaryEntryRootID(sectionId);
  return {
    ...ordinarySectionInput({
      data: {
        dictionary: { id: sectionId, name },
        entryDiagnostics: {},
      } satisfies ParameterDictionarySectionData,
      id: sectionId,
      kind: PENDING_PARAMETER_DICTIONARY_SECTION_KIND,
      name,
      size: PARAMETER_DICTIONARY_SECTION_SIZE,
    }),
    positionAndSizeLocked: true,
    itemTree: {
      rootId,
      items: { [rootId]: { id: rootId, children: [] } },
      selectedItemIds: [],
    },
  };
}

export function createPendingListSection(
  sectionId: string,
  name: string,
): WorkspaceSectionInput {
  return {
    ...ordinarySectionInput({
      data: {
        childCount: 0,
        list: { id: sectionId, name },
        pending: true,
      } satisfies ListSectionData,
      id: sectionId,
      kind: PENDING_LIST_SECTION_KIND,
      name,
      size: LIST_SECTION_SIZE,
    }),
    positionAndSizeLocked: true,
  };
}

export function projectWorkspaceDocument(
  snapshot: ProjectSnapshotV2,
): WorkspaceDocument {
  return projectWorkspaceDocumentWithDescriptors(
    snapshot,
    projectSectionDescriptors(snapshot),
  );
}

function projectWorkspaceDocumentWithDescriptors(
  snapshot: ProjectSnapshotV2,
  descriptors: ReadonlyArray<ProjectSectionDescriptor>,
): WorkspaceDocument {
  const descriptorByCanonicalID = descriptorsByCanonicalID(descriptors);
  const sections: WorkspaceDocument["sections"] = {
    [GENERATED_PYTHON_SECTION_ID]: projectGeneratedPythonSection(snapshot),
  };
  for (const descriptor of descriptors) {
    sections[descriptor.workspaceId] = projectSection(
      snapshot,
      descriptor,
      descriptorByCanonicalID,
    );
  }
  const topLevelSections: WorkspaceDocument["topLevelSections"] = {
    [GENERATED_PYTHON_SECTION_ID]: generatedPythonLayout(
      snapshot.topLevelSectionIds.length,
    ),
  };
  for (const [index, canonicalId] of snapshot.topLevelSectionIds.entries()) {
    const descriptor = requireSectionDescriptor(
      descriptorByCanonicalID,
      canonicalId,
    );
    const section = sections[descriptor.workspaceId];
    if (section === undefined) {
      throw new Error(
        `Python Canvas projection is missing ${descriptor.workspaceId}.`,
      );
    }
    topLevelSections[descriptor.workspaceId] = sectionLayout(index, section);
  }
  return {
    sections,
    topLevelSections,
    viewport: null,
    activeIds: [],
  };
}

// Publishes one complete canonical snapshot in a single workspace transaction.
// The server owns data and placement; the client retains only section geometry,
// local selection, filtering, and unresolved local item proposals.
export function applyProjectSnapshotToWorkspace(
  host: WorkspaceHost,
  snapshot: ProjectSnapshotV2,
  options: ProjectSnapshotProjectionOptions,
): void {
  const current = host.getSnapshot();
  const descriptors = projectSectionDescriptors(snapshot);
  const descriptorByCanonicalID = descriptorsByCanonicalID(descriptors);
  const projected = projectWorkspaceDocumentWithDescriptors(snapshot, descriptors);
  const sections: WorkspaceDocument["sections"] = {};

  for (const descriptor of descriptors) {
    const next = requireProjectedSection(projected, descriptor.workspaceId);
    const pendingSectionId = options.pendingSectionIds.get(
      descriptor.canonicalId,
    );
    const previous =
      current.sections[descriptor.workspaceId] ??
      (pendingSectionId === undefined
        ? undefined
        : current.sections[pendingSectionId]);
    sections[descriptor.workspaceId] = projectCanonicalResponseSection(
      previous,
      next,
      descriptor,
      options,
    );
  }

  const generated = projectGeneratedSection(
    current,
    projected,
    snapshot,
    options,
    host,
  );
  sections[GENERATED_PYTHON_SECTION_ID] = generated.section;
  const topLevelSections: WorkspaceDocument["topLevelSections"] = {
    [GENERATED_PYTHON_SECTION_ID]: generated.layout,
  };
  for (const canonicalId of snapshot.topLevelSectionIds) {
    const descriptor = requireSectionDescriptor(
      descriptorByCanonicalID,
      canonicalId,
    );
    const pendingSectionId = options.pendingSectionIds.get(canonicalId);
    const layout =
      current.topLevelSections[descriptor.workspaceId] ??
      (pendingSectionId === undefined
        ? undefined
        : current.topLevelSections[pendingSectionId]) ??
      projected.topLevelSections[descriptor.workspaceId];
    if (layout === undefined) {
      throw new Error(
        `Python Canvas projection is missing top-level layout ${descriptor.workspaceId}.`,
      );
    }
    topLevelSections[descriptor.workspaceId] = layout;
  }

  commitWorkspaceDocument(host, {
    ...current,
    sections,
    topLevelSections,
    activeIds: projectActiveSectionIds(
      current.activeIds,
      sections,
      descriptors,
      options.pendingSectionIds,
    ),
  });
}

export function readGeneratedPythonTarget(host: WorkspaceHost): {
  generated: string;
  prefix: string;
  suffix: string;
} {
  const data = getWorkspaceCodeSectionData(host, GENERATED_PYTHON_SECTION_ID);
  if (data.mode !== "generated-document") {
    throw new Error("Generated Python is not a generated document.");
  }
  const { from, to } = data.generatedRegion;
  const protectedCode = data.code.slice(from, to);
  if (
    !protectedCode.startsWith(generatedCodeSeparator) ||
    !protectedCode.endsWith(generatedCodeSeparator)
  ) {
    throw new Error("Generated Python separators are not canonical.");
  }
  return {
    generated: protectedCode.slice(
      generatedCodeSeparator.length,
      -generatedCodeSeparator.length,
    ),
    prefix: data.code.slice(0, from),
    suffix: data.code.slice(to),
  };
}

export function setParameterItemExpression(
  host: WorkspaceHost,
  callableId: string,
  parameterId: string,
  authoredExpression: string,
): void {
  updateParameterItem(host, callableId, parameterId, (data) =>
    data.authoredExpression === authoredExpression
      ? null
      : { ...data, authoredExpression },
  );
}

export function setParameterItemName(
  host: WorkspaceHost,
  callableId: string,
  parameterId: string,
  name: string,
): void {
  updateParameterItem(host, callableId, parameterId, (data) =>
    data.name === name ? null : { ...data, name },
  );
}

export function setDictionaryEntryExpression(
  host: WorkspaceHost,
  dictionaryId: string,
  entryItemId: string,
  authoredExpression: string,
): void {
  updateDictionaryEntryItem(host, dictionaryId, entryItemId, (data) => {
    if (data.kind !== DICTIONARY_ENTRY_KIND_LEAF_V2) {
      return null;
    }
    return data.authoredExpression === authoredExpression
      ? null
      : { ...data, authoredExpression };
  });
}

export function setDictionaryEntryName(
  host: WorkspaceHost,
  dictionaryId: string,
  entryItemId: string,
  name: string,
): void {
  updateDictionaryEntryItem(host, dictionaryId, entryItemId, (data) =>
    data.name === name ? null : { ...data, name },
  );
}

// The generic item tree intentionally owns only structural movement. Once a
// leaf owns a child, make its application data an explicit dictionary parent
// in the same local document transaction. That marker remains after its last
// child moves away, so an empty parent never turns back into a leaf expression.
export function promoteDictionaryEntryParents(
  host: WorkspaceHost,
  dictionaryId: string,
): boolean {
  const document = host.getSnapshot();
  const sectionId = parameterDictionarySectionID(dictionaryId);
  const section = document.sections[sectionId];
  const itemTree = section?.itemTree;
  if (section === undefined || itemTree === undefined) {
    return false;
  }
  let changed = false;
  const items: WorkspaceSectionItemTree["items"] = { ...itemTree.items };
  for (const [itemId, item] of Object.entries(itemTree.items)) {
    if (itemId === itemTree.rootId || item.children.length === 0) {
      continue;
    }
    const data = readDictionaryEntryItemData(item.data);
    if (data.kind === DICTIONARY_ENTRY_KIND_LEAF_V2) {
      items[itemId] = {
        ...item,
        data: {
          kind: DICTIONARY_ENTRY_KIND_PARENT_V2,
          name: data.name,
        } satisfies DictionaryEntryItemData,
      };
      changed = true;
    }
  }
  if (!changed) {
    return false;
  }
  commitWorkspaceDocument(host, {
    ...document,
    sections: {
      ...document.sections,
      [sectionId]: {
        ...section,
        itemTree: { ...itemTree, items },
      },
    },
  });
  return true;
}

export function createCallableParameterItem(): WorkspaceItem {
  const parameterId = `parameter:authored:${crypto.randomUUID()}`;
  return {
    id: parameterWorkspaceItemID(parameterId),
    children: [],
    data: {
      authoredExpression: "",
      default: null,
      name: "",
      nameEditable: true,
      passingStyle: PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2,
      providerOrdinal: null,
      typeAnnotation: null,
    } satisfies ParameterItemData,
  };
}

export function createParameterDictionaryEntryItem(): WorkspaceItem {
  const entryId = `dictionary-entry:authored:${crypto.randomUUID()}`;
  return {
    id: dictionaryEntryWorkspaceItemID(entryId),
    children: [],
    data: {
      authoredExpression: "",
      kind: DICTIONARY_ENTRY_KIND_LEAF_V2,
      name: "",
    } satisfies DictionaryEntryItemData,
  };
}

export function readCallableParameterRows(
  section: WorkspaceSection,
): Array<{ data: ParameterItemData; id: string }> {
  const itemTree = section.itemTree;
  if (itemTree === undefined) {
    throw new Error("The Python Canvas callable section has no item tree.");
  }
  const root = itemTree.items[itemTree.rootId];
  if (root === undefined) {
    throw new Error("The Python Canvas callable parameter root is missing.");
  }
  return root.children.map((itemId) => {
    const item = itemTree.items[itemId];
    if (item === undefined) {
      throw new Error(`Python Canvas parameter item ${itemId} is missing.`);
    }
    return { data: readParameterItemData(item.data), id: itemId };
  });
}

export function readCallableParameterItems(
  document: WorkspaceDocument,
  callableId: string,
): Array<{ data: ParameterItemData; id: string }> {
  const section = document.sections[callableSectionID(callableId)];
  if (section === undefined) {
    throw new Error(`Python Canvas callable ${callableId} is missing.`);
  }
  return readCallableParameterRows(section).map((item) => ({
    data: item.data,
    id: canonicalParameterID(item.id),
  }));
}

export function readParameterDictionaryEntries(
  document: WorkspaceDocument,
  dictionaryId: string,
): DictionaryEntryV2[] {
  const section = document.sections[parameterDictionarySectionID(dictionaryId)];
  if (section?.itemTree === undefined) {
    throw new Error(
      `Python Canvas parameter dictionary ${dictionaryId} is missing.`,
    );
  }
  return readDictionaryEntriesFromTree(section.itemTree);
}

// Returns only a complete placement proposal. A transient deletion or creation
// intentionally returns null, leaving its typed create/delete command as the
// sole owner of the mutation.
export function workspaceForestProposal(
  document: WorkspaceDocument,
  snapshot: ProjectSnapshotV2,
): {
  listChildren: Array<{ childSectionIds: string[]; listId: string }>;
  topLevelSectionIds: string[];
} | null {
  const descriptors = projectSectionDescriptors(snapshot);
  const descriptorByWorkspaceID = new Map(
    descriptors.map((descriptor) => [descriptor.workspaceId, descriptor]),
  );
  const canonicalIDs = new Set(
    descriptors.map((descriptor) => descriptor.canonicalId),
  );
  const placements = new Set<string>();
  const listChildren: Array<{ childSectionIds: string[]; listId: string }> = [];

  for (const list of snapshot.lists) {
    const section = document.sections[listSectionID(list.id)];
    if (section === undefined) {
      return null;
    }
    const childSectionIds: string[] = [];
    for (const workspaceChildId of section.children) {
      const child = descriptorByWorkspaceID.get(workspaceChildId);
      if (child === undefined || placements.has(child.canonicalId)) {
        return null;
      }
      placements.add(child.canonicalId);
      childSectionIds.push(child.canonicalId);
    }
    listChildren.push({ childSectionIds, listId: list.id });
  }

  const topLevelSectionIds = Object.entries(document.topLevelSections)
    .map(([workspaceId, layout]) => ({
      descriptor: descriptorByWorkspaceID.get(workspaceId),
      workspaceId,
      zIndex: layout.zIndex,
    }))
    .filter(
      (
        entry,
      ): entry is {
        descriptor: ProjectSectionDescriptor;
        workspaceId: string;
        zIndex: number;
      } => entry.descriptor !== undefined,
    )
    .sort(
      (left, right) =>
        left.zIndex - right.zIndex ||
        left.workspaceId.localeCompare(right.workspaceId),
    )
    .map(({ descriptor }) => descriptor.canonicalId);
  for (const canonicalId of topLevelSectionIds) {
    if (placements.has(canonicalId)) {
      return null;
    }
    placements.add(canonicalId);
  }
  if (
    placements.size !== canonicalIDs.size ||
    [...canonicalIDs].some((id) => !placements.has(id))
  ) {
    return null;
  }
  return { listChildren, topLevelSectionIds };
}

function ordinarySectionInput({
  data,
  id,
  kind,
  name,
  size,
}: {
  data: WorkspaceSection["data"];
  id: string;
  kind: string;
  name: string;
  size: WorkspaceSection["size"];
}): WorkspaceSection {
  return {
    id,
    kind,
    name,
    size,
    overflowMode: false,
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children: [],
    data,
  };
}

function pendingCallableSectionData(
  snapshot: Pick<ProjectSnapshotV2, "providerStatus">,
  sectionId: string,
  name: string,
): CallableSectionData {
  return {
    callable: { authoredExpression: "", id: sectionId, name },
    callableDiagnosticMessage: null,
    parameterDiagnostics: {},
    providerStatus: snapshot.providerStatus,
  };
}

function projectSectionDescriptors(
  snapshot: ProjectSnapshotV2,
): ProjectSectionDescriptor[] {
  return [
    ...snapshot.callables.map((callable) => ({
      callable,
      canonicalId: callable.id,
      kind: "callable" as const,
      workspaceId: callableSectionID(callable.id),
    })),
    ...snapshot.parameterDictionaries.map((dictionary) => ({
      canonicalId: dictionary.id,
      dictionary,
      kind: "dictionary" as const,
      workspaceId: parameterDictionarySectionID(dictionary.id),
    })),
    ...snapshot.lists.map((list) => ({
      canonicalId: list.id,
      kind: "list" as const,
      list,
      workspaceId: listSectionID(list.id),
    })),
  ];
}

function descriptorsByCanonicalID(
  descriptors: ReadonlyArray<ProjectSectionDescriptor>,
): Map<string, ProjectSectionDescriptor> {
  return new Map(
    descriptors.map((descriptor) => [descriptor.canonicalId, descriptor]),
  );
}

function requireSectionDescriptor(
  descriptors: ReadonlyMap<string, ProjectSectionDescriptor>,
  canonicalId: string,
): ProjectSectionDescriptor {
  const descriptor = descriptors.get(canonicalId);
  if (descriptor === undefined) {
    throw new Error(`Python Canvas projection is missing ${canonicalId}.`);
  }
  return descriptor;
}

function projectSection(
  snapshot: ProjectSnapshotV2,
  descriptor: ProjectSectionDescriptor,
  descriptorByCanonicalID: ReadonlyMap<string, ProjectSectionDescriptor>,
): WorkspaceSection {
  switch (descriptor.kind) {
    case "callable":
      return projectCallableSection(snapshot, descriptor.callable);
    case "dictionary":
      return projectParameterDictionarySection(snapshot, descriptor.dictionary);
    case "list":
      return projectListSection(descriptor.list, descriptorByCanonicalID);
  }
}

function projectCanonicalResponseSection(
  previous: WorkspaceSection | undefined,
  next: WorkspaceSection,
  descriptor: ProjectSectionDescriptor,
  options: ProjectSnapshotProjectionOptions,
): WorkspaceSection {
  if (previous === undefined) {
    return next;
  }
  const retained = retainSectionPresentation(previous, next);
  switch (descriptor.kind) {
    case "callable":
      return {
        ...retained,
        itemTree: projectCallableItemTree(
          previous.itemTree,
          descriptor.callable,
          options,
        ),
      };
    case "dictionary":
      return {
        ...retained,
        itemTree: projectDictionaryItemTree(
          previous.itemTree,
          descriptor.dictionary,
          options,
        ),
      };
    case "list":
      return retained;
  }
}

function retainSectionPresentation(
  previous: WorkspaceSection,
  next: WorkspaceSection,
): WorkspaceSection {
  return {
    ...next,
    isHorizontalOrientation: previous.isHorizontalOrientation,
    isMinimized: previous.isMinimized,
    positionAndSizeLocked: isPendingPythonCanvasSection(previous.kind)
      ? next.positionAndSizeLocked
      : previous.positionAndSizeLocked,
    size: previous.size,
    styleColor: previous.styleColor,
    tagColor: previous.tagColor,
  };
}

function isPendingPythonCanvasSection(kind: string): boolean {
  return (
    kind === PENDING_CALLABLE_SECTION_KIND ||
    kind === PENDING_PARAMETER_DICTIONARY_SECTION_KIND ||
    kind === PENDING_LIST_SECTION_KIND
  );
}

function projectActiveSectionIds(
  activeIds: ReadonlyArray<string>,
  sections: WorkspaceDocument["sections"],
  descriptors: ReadonlyArray<ProjectSectionDescriptor>,
  pendingSectionIds: ReadonlyMap<string, string>,
): string[] {
  const descriptorsByID = descriptorsByCanonicalID(descriptors);
  const canonicalIDsByPendingSectionID = new Map<string, string>();
  for (const [canonicalId, pendingSectionId] of pendingSectionIds) {
    const descriptor = descriptorsByID.get(canonicalId);
    if (descriptor !== undefined) {
      canonicalIDsByPendingSectionID.set(
        pendingSectionId,
        descriptor.workspaceId,
      );
    }
  }
  const projected: string[] = [];
  for (const activeId of activeIds) {
    const projectedId =
      sections[activeId] === undefined
        ? canonicalIDsByPendingSectionID.get(activeId)
        : activeId;
    if (
      projectedId !== undefined &&
      sections[projectedId] !== undefined &&
      !projected.includes(projectedId)
    ) {
      projected.push(projectedId);
    }
  }
  return projected;
}

function requireProjectedSection(
  projected: WorkspaceDocument,
  sectionId: string,
): WorkspaceSection {
  const section = projected.sections[sectionId];
  if (section === undefined) {
    throw new Error(`Python Canvas projection is missing ${sectionId}.`);
  }
  return section;
}

function projectCallableItemTree(
  previous: WorkspaceSectionItemTree | undefined,
  callable: CallableV2,
  options: ProjectSnapshotProjectionOptions,
): WorkspaceSectionItemTree {
  if (previous !== undefined && options.keepParameterLists.has(callable.id)) {
    return previous;
  }
  return projectCanonicalParameterItems(previous, callable);
}

function projectDictionaryItemTree(
  previous: WorkspaceSectionItemTree | undefined,
  dictionary: ParameterDictionaryV2,
  options: ProjectSnapshotProjectionOptions,
): WorkspaceSectionItemTree {
  if (
    previous !== undefined &&
    options.keepDictionaryEntries.has(dictionary.id)
  ) {
    return previous;
  }
  return projectCanonicalDictionaryEntries(previous, dictionary);
}

function projectGeneratedSection(
  current: WorkspaceDocument,
  projected: WorkspaceDocument,
  snapshot: ProjectSnapshotV2,
  options: ProjectSnapshotProjectionOptions,
  host: WorkspaceHost,
): {
  layout: WorkspaceDocument["topLevelSections"][string];
  section: WorkspaceSection;
} {
  const next = requireProjectedSection(projected, GENERATED_PYTHON_SECTION_ID);
  const previous = current.sections[GENERATED_PYTHON_SECTION_ID];
  const section =
    previous === undefined
      ? next
      : {
          ...retainSectionPresentation(previous, next),
          data: options.keepAuthoredPython
            ? retainedGeneratedCodeData(host, snapshot)
            : next.data,
        };
  const layout =
    current.topLevelSections[GENERATED_PYTHON_SECTION_ID] ??
    projected.topLevelSections[GENERATED_PYTHON_SECTION_ID];
  if (layout === undefined) {
    throw new Error("Python Canvas projection is missing Generated Python.");
  }
  return { layout, section };
}

function projectCallableSection(
  snapshot: ProjectSnapshotV2,
  callable: CallableV2,
): WorkspaceSection {
  const sectionId = callableSectionID(callable.id);
  return {
    ...ordinarySectionInput({
      data: projectCallableSectionData(snapshot, callable),
      id: sectionId,
      kind: CALLABLE_SECTION_KIND,
      name: callable.name,
      size: CALLABLE_SECTION_SIZE,
    }),
    itemTree: projectCanonicalParameterItems(undefined, callable),
  };
}

function projectParameterDictionarySection(
  snapshot: ProjectSnapshotV2,
  dictionary: ParameterDictionaryV2,
): WorkspaceSection {
  const sectionId = parameterDictionarySectionID(dictionary.id);
  return {
    ...ordinarySectionInput({
      data: projectParameterDictionarySectionData(snapshot, dictionary),
      id: sectionId,
      kind: PARAMETER_DICTIONARY_SECTION_KIND,
      name: dictionary.name,
      size: PARAMETER_DICTIONARY_SECTION_SIZE,
    }),
    itemTree: projectCanonicalDictionaryEntries(undefined, dictionary),
  };
}

function projectListSection(
  list: ListV2,
  descriptorByCanonicalID: ReadonlyMap<string, ProjectSectionDescriptor>,
): WorkspaceSection {
  return {
    ...ordinarySectionInput({
      data: {
        childCount: list.childSectionIds.length,
        list: { id: list.id, name: list.name },
        pending: false,
      } satisfies ListSectionData,
      id: listSectionID(list.id),
      kind: LIST_SECTION_KIND,
      name: list.name,
      size: LIST_SECTION_SIZE,
    }),
    children: list.childSectionIds.map(
      (childId) =>
        requireSectionDescriptor(descriptorByCanonicalID, childId).workspaceId,
    ),
  };
}

function projectCanonicalParameterItems(
  previous: WorkspaceSectionItemTree | undefined,
  callable: CallableV2,
): WorkspaceSectionItemTree {
  const rootId = parameterItemRootID(callable.id);
  const ids = callable.parameters.map((parameter) =>
    parameterWorkspaceItemID(parameter.id),
  );
  const items: Record<string, WorkspaceItem> = {
    [rootId]: { id: rootId, children: ids },
  };
  for (const parameter of callable.parameters) {
    const itemId = parameterWorkspaceItemID(parameter.id);
    items[itemId] = {
      id: itemId,
      children: [],
      data: projectParameterItemData(parameter),
    };
  }
  return {
    rootId,
    items,
    selectedItemIds:
      previous?.selectedItemIds.filter((id) => ids.includes(id)) ?? [],
  };
}

function projectCanonicalDictionaryEntries(
  previous: WorkspaceSectionItemTree | undefined,
  dictionary: ParameterDictionaryV2,
): WorkspaceSectionItemTree {
  const rootId = dictionaryEntryRootID(dictionary.id);
  const items: Record<string, WorkspaceItem> = {
    [rootId]: { id: rootId, children: [] },
  };

  function projectEntries(
    parentId: string,
    entries: ReadonlyArray<DictionaryEntryV2>,
  ) {
    const parent = items[parentId];
    if (parent === undefined) {
      throw new Error(`Python Canvas dictionary entry ${parentId} is missing.`);
    }
    const childIds = entries.map((entry) =>
      dictionaryEntryWorkspaceItemID(entry.id),
    );
    items[parentId] = { ...parent, children: childIds };
    for (const entry of entries) {
      const itemId = dictionaryEntryWorkspaceItemID(entry.id);
      items[itemId] = {
        children:
          entry.kind === DICTIONARY_ENTRY_KIND_PARENT_V2
            ? entry.children.map((child) =>
                dictionaryEntryWorkspaceItemID(child.id),
              )
            : [],
        data: projectDictionaryEntryItemData(entry),
        id: itemId,
      };
      if (entry.kind === DICTIONARY_ENTRY_KIND_PARENT_V2) {
        projectEntries(itemId, entry.children);
      }
    }
  }

  projectEntries(rootId, dictionary.entries);
  const itemIds = new Set(Object.keys(items));
  return {
    rootId,
    items,
    selectedItemIds:
      previous?.selectedItemIds.filter((id) => itemIds.has(id)) ?? [],
  };
}

function readDictionaryEntriesFromTree(
  itemTree: WorkspaceSectionItemTree,
): DictionaryEntryV2[] {
  function readEntries(parentId: string): DictionaryEntryV2[] {
    const parent = itemTree.items[parentId];
    if (parent === undefined) {
      throw new Error(`Python Canvas dictionary entry ${parentId} is missing.`);
    }
    return parent.children.map((itemId) => {
      const item = itemTree.items[itemId];
      if (item === undefined) {
        throw new Error(
          `Python Canvas dictionary entry ${itemId} is missing.`,
        );
      }
      const data = readDictionaryEntryItemData(item.data);
      const id = canonicalDictionaryEntryID(item.id);
      if (
        data.kind === DICTIONARY_ENTRY_KIND_PARENT_V2 ||
        item.children.length > 0
      ) {
        return {
          children: readEntries(item.id),
          id,
          kind: DICTIONARY_ENTRY_KIND_PARENT_V2,
          name: data.name,
        };
      }
      return {
        authoredExpression: data.authoredExpression,
        id,
        kind: DICTIONARY_ENTRY_KIND_LEAF_V2,
        name: data.name,
      };
    });
  }
  return readEntries(itemTree.rootId);
}

function updateParameterItem(
  host: WorkspaceHost,
  callableId: string,
  parameterItemId: string,
  next: (data: ParameterItemData) => ParameterItemData | null,
): void {
  const sectionId = callableSectionID(callableId);
  const section = host.getSnapshot().sections[sectionId];
  if (section === undefined) {
    return;
  }
  const current = readCallableParameterRows(section).find(
    (item) => item.id === parameterItemId,
  );
  if (current === undefined) {
    return;
  }
  const data = next(current.data);
  if (data !== null) {
    setItemData(host, sectionId, parameterItemId, data);
  }
}

function updateDictionaryEntryItem(
  host: WorkspaceHost,
  dictionaryId: string,
  entryItemId: string,
  next: (data: DictionaryEntryItemData) => DictionaryEntryItemData | null,
): void {
  const sectionId = parameterDictionarySectionID(dictionaryId);
  const item = host.getSnapshot().sections[sectionId]?.itemTree?.items[
    entryItemId
  ];
  if (item === undefined) {
    return;
  }
  const data = next(readDictionaryEntryItemData(item.data));
  if (data !== null) {
    setItemData(host, sectionId, entryItemId, data);
  }
}

function projectCallableSectionData(
  snapshot: ProjectSnapshotV2,
  callable: CallableV2,
): CallableSectionData {
  const parameterIds = new Set(
    callable.parameters.map((parameter) => parameter.id),
  );
  const callableMessages: string[] = [];
  const parameterDiagnostics: CallableSectionData["parameterDiagnostics"] = {};
  for (const diagnostic of snapshot.diagnostics) {
    if (diagnostic.targetId === callable.id) {
      callableMessages.push(diagnostic.message);
    } else if (
      diagnostic.targetId !== null &&
      parameterIds.has(diagnostic.targetId)
    ) {
      const itemId = parameterWorkspaceItemID(diagnostic.targetId);
      parameterDiagnostics[itemId] = [
        ...(parameterDiagnostics[itemId] ?? []),
        projectItemDiagnostic(diagnostic),
      ];
    }
  }
  return {
    callable: {
      authoredExpression: callable.authoredExpression,
      id: callable.id,
      name: callable.name,
    },
    callableDiagnosticMessage:
      callableMessages.length === 0 ? null : callableMessages.join("\n"),
    parameterDiagnostics,
    providerStatus: snapshot.providerStatus,
  };
}

function projectParameterDictionarySectionData(
  snapshot: ProjectSnapshotV2,
  dictionary: ParameterDictionaryV2,
): ParameterDictionarySectionData {
  const entryIDs = new Set<string>();
  function collect(entries: ReadonlyArray<DictionaryEntryV2>) {
    for (const entry of entries) {
      entryIDs.add(entry.id);
      if (entry.kind === DICTIONARY_ENTRY_KIND_PARENT_V2) {
        collect(entry.children);
      }
    }
  }
  collect(dictionary.entries);
  const entryDiagnostics: ParameterDictionarySectionData["entryDiagnostics"] =
    {};
  for (const diagnostic of snapshot.diagnostics) {
    if (diagnostic.targetId !== null && entryIDs.has(diagnostic.targetId)) {
      const itemId = dictionaryEntryWorkspaceItemID(diagnostic.targetId);
      entryDiagnostics[itemId] = [
        ...(entryDiagnostics[itemId] ?? []),
        projectItemDiagnostic(diagnostic),
      ];
    }
  }
  return {
    dictionary: { id: dictionary.id, name: dictionary.name },
    entryDiagnostics,
  };
}

function projectParameterItemData(parameter: ParameterV2): ParameterItemData {
  return {
    authoredExpression: parameter.authoredExpression,
    default: parameter.default,
    name: parameter.name,
    nameEditable: parameter.nameEditable,
    passingStyle: parameter.passingStyle,
    providerOrdinal: parameter.providerOrdinal,
    typeAnnotation: parameter.typeAnnotation,
  };
}

function projectDictionaryEntryItemData(
  entry: DictionaryEntryV2,
): DictionaryEntryItemData {
  if (entry.kind === DICTIONARY_ENTRY_KIND_PARENT_V2) {
    return { kind: entry.kind, name: entry.name };
  }
  return {
    authoredExpression: entry.authoredExpression,
    kind: entry.kind,
    name: entry.name,
  };
}

function projectItemDiagnostic(
  diagnostic: DiagnosticV2,
): WorkspaceItemDiagnostic {
  return {
    message: diagnostic.message,
    severity:
      diagnostic.severity === DIAGNOSTIC_SEVERITY_INFORMATION_V2
        ? "info"
        : diagnostic.severity,
  };
}

function projectGeneratedPythonSection(
  snapshot: ProjectSnapshotV2,
): WorkspaceSection {
  return ordinarySectionInput({
    data: projectGeneratedCodeData(snapshot),
    id: GENERATED_PYTHON_SECTION_ID,
    kind: WORKSPACE_CODE_SECTION_KIND,
    name: "Generated Python",
    size: GENERATED_PYTHON_SECTION_SIZE,
  });
}

function projectGeneratedCodeData(snapshot: ProjectSnapshotV2) {
  const { prefix, suffix } = snapshot.pythonTarget;
  const { body, code, generatedBodyRange } = snapshot.generatedCode;
  const expected = `${prefix}${generatedCodeSeparator}${body}${generatedCodeSeparator}${suffix}`;
  if (code !== expected) {
    throw new Error(
      "Generated Python does not compose its canonical target and body.",
    );
  }
  return generatedCodeSectionData({
    body,
    diagnostics: projectDocumentDiagnostics(snapshot),
    generatedBodyRange,
    prefix,
    suffix,
  });
}

function retainedGeneratedCodeData(
  host: WorkspaceHost,
  snapshot: ProjectSnapshotV2,
) {
  const { prefix, suffix } = readGeneratedPythonTarget(host);
  return generatedCodeSectionData({
    body: snapshot.generatedCode.body,
    diagnostics: [],
    prefix,
    suffix,
  });
}

function generatedCodeSectionData({
  body,
  diagnostics,
  generatedBodyRange,
  prefix,
  suffix,
}: {
  body: string;
  diagnostics: ReadonlyArray<WorkspaceCodeSectionDiagnostic>;
  generatedBodyRange?: { end: number; start: number };
  prefix: string;
  suffix: string;
}) {
  const bodyStartBytes =
    generatedBodyRange?.start ??
    utf8ByteLength(prefix) + generatedCodeSeparator.length;
  const bodyEndBytes =
    generatedBodyRange?.end ?? bodyStartBytes + utf8ByteLength(body);
  const code = `${prefix}${generatedCodeSeparator}${body}${generatedCodeSeparator}${suffix}`;
  const separatorBytes = utf8ByteLength(generatedCodeSeparator);
  return createWorkspaceCodeSectionData({
    code,
    diagnostics: [...diagnostics],
    generatedRegion: {
      from: utf8ByteOffsetToUtf16Offset(code, bodyStartBytes - separatorBytes),
      to: utf8ByteOffsetToUtf16Offset(code, bodyEndBytes + separatorBytes),
    },
    indentWidth: 4,
    language: "python",
    lineNumbers: true,
    mode: "generated-document",
    wrapLines: true,
  });
}

function projectDocumentDiagnostics(
  snapshot: ProjectSnapshotV2,
): Array<WorkspaceCodeSectionDiagnostic> {
  return snapshot.diagnostics.flatMap((diagnostic) => {
    if (diagnostic.targetId !== null) {
      return [];
    }
    return [
      {
        from: utf8ByteOffsetToUtf16Offset(
          snapshot.generatedCode.code,
          diagnostic.start,
        ),
        to: utf8ByteOffsetToUtf16Offset(
          snapshot.generatedCode.code,
          diagnostic.end,
        ),
        message: diagnostic.message,
        severity:
          diagnostic.severity === DIAGNOSTIC_SEVERITY_INFORMATION_V2
            ? "info"
            : diagnostic.severity,
      },
    ];
  });
}

function sectionLayout(index: number, section: WorkspaceSection) {
  const width = typeof section.size.width === "number" ? section.size.width : 360;
  const height =
    typeof section.size.height === "number" ? section.size.height : 300;
  const column = index % 2;
  const row = Math.floor(index / 2);
  return {
    x: column * (width + 32),
    y: row * (height + 32),
    w: width,
    h: height,
    zIndex: index,
  };
}

function generatedPythonLayout(topLevelCount: number) {
  const rows = Math.max(1, Math.ceil(topLevelCount / 2));
  return {
    x: 0,
    y: rows * (CALLABLE_SECTION_SIZE.height + 48),
    w: GENERATED_PYTHON_SECTION_SIZE.width,
    h: GENERATED_PYTHON_SECTION_SIZE.height,
    zIndex: topLevelCount,
  };
}

function canonicalParameterID(itemId: string): string {
  return canonicalWorkspaceItemID(
    itemId,
    parameterWorkspaceItemPrefix,
    "parameter",
  );
}

function canonicalDictionaryEntryID(itemId: string): string {
  return canonicalWorkspaceItemID(
    itemId,
    dictionaryEntryWorkspaceItemPrefix,
    "dictionary entry",
  );
}

function canonicalWorkspaceItemID(
  itemId: string,
  prefix: string,
  kind: string,
): string {
  if (!itemId.startsWith(prefix)) {
    throw new Error(`Python Canvas ${kind} item ${itemId} is invalid.`);
  }
  const encoded = itemId.slice(prefix.length);
  let id: string;
  try {
    id = decodeURIComponent(encoded);
  } catch {
    throw new Error(`Python Canvas ${kind} item ${itemId} is invalid.`);
  }
  if (id === "" || `${prefix}${encodeURIComponent(id)}` !== itemId) {
    throw new Error(`Python Canvas ${kind} item ${itemId} is invalid.`);
  }
  return id;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function utf8ByteOffsetToUtf16Offset(code: string, byteOffset: number): number {
  const encoder = new TextEncoder();
  let utf8Offset = 0;
  let utf16Offset = 0;
  if (byteOffset === 0) {
    return 0;
  }
  for (const character of code) {
    const nextUtf8Offset = utf8Offset + encoder.encode(character).length;
    if (byteOffset < nextUtf8Offset) {
      throw new Error("Document offset is not a UTF-8 boundary.");
    }
    utf8Offset = nextUtf8Offset;
    utf16Offset += character.length;
    if (byteOffset === utf8Offset) {
      return utf16Offset;
    }
  }
  throw new Error("Document offset exceeds generated Python.");
}
