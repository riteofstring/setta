import {
  commitWorkspaceDocument,
  setItemLabel,
  setItemValue,
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
  PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2,
  type CallableV2,
  type DiagnosticV2,
  type ListV2,
  type ParameterDictionaryV2,
  type ParameterV2,
  type ProjectSnapshotV2,
} from "../api/generatedContract";
import {
  type CallableSectionData,
  type ParameterItemData,
  readCallableSectionData,
  readParameterItemData,
} from "../sections/CallableSection";
import {
  type ParameterDictionarySectionData,
  readParameterDictionarySectionData,
} from "../sections/ParamDictSection";
import { type ListSectionData } from "../sections/ListSection";
import {
  projectGeneratedPythonSection,
  readGeneratedPythonTarget as readGeneratedPythonTargetForSection,
  retainedGeneratedCodeData,
} from "./generatedPythonProjection";
import { retainLaggingDiagnosticPresentation } from "./laggingDiagnosticPresentation";
import {
  createParameterDictionaryEntryItem,
  dictionaryEntryParentPromotionRequired,
  dictionaryEntryRootID,
  dictionaryEntryWorkspaceItemID,
  parameterDictionarySectionID,
  projectCanonicalDictionaryEntries,
  projectParameterDictionarySectionData,
  promoteDictionaryEntryParents,
  readParameterDictionaryEntries,
  setDictionaryEntryExpression,
  setDictionaryEntryName,
} from "./workspaceProjectionDictionary";
import { projectWorkspaceForestProposal } from "./workspaceForestProjection";
import { addPlaygroundSections } from "./pythonCanvasPlaygroundLayout";
import {
  type ConfigurableParameterUIV2,
  defaultCodeParameterUI,
  parameterUIFromWorkspaceControl,
  projectParameterControl,
  projectParameterPresentation,
  pythonExpressionFromWorkspaceControl,
  workspaceControlValue,
} from "./parameterUIPresentation";
import {
  callableSectionID,
  canonicalParameterID,
  listSectionID,
  parameterItemRootID,
  parameterWorkspaceItemID,
} from "./workspaceProjectionIds";
import {
  frontmostClipboardRootLayoutZIndexes,
  projectClipboardActiveSectionIds,
  projectClipboardSectionPresentation,
  projectClipboardTopLevelLayout,
  type ProjectClipboardProjectionOptions,
} from "./workspaceClipboardProjection";
import {
  CALLABLE_SECTION_SIZE,
  GENERATED_PYTHON_SECTION_SIZE,
  generatedPythonLayout,
  LIST_SECTION_SIZE,
  PARAMETER_DICTIONARY_SECTION_SIZE,
  sectionLayout,
} from "./workspaceProjectionLayout";

export {
  createParameterDictionaryEntryItem,
  dictionaryEntryParentPromotionRequired,
  dictionaryEntryWorkspaceItemID,
  parameterDictionarySectionID,
  promoteDictionaryEntryParents,
  readParameterDictionaryEntries,
  setDictionaryEntryExpression,
  setDictionaryEntryName,
};
export {
  callableSectionID,
  listSectionID,
  parameterWorkspaceItemID,
} from "./workspaceProjectionIds";
export {
  CALLABLE_SECTION_SIZE,
  GENERATED_PYTHON_SECTION_SIZE,
  LIST_SECTION_SIZE,
  PARAMETER_DICTIONARY_SECTION_SIZE,
} from "./workspaceProjectionLayout";

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

export type ProjectSnapshotProjectionOptions =
  ProjectClipboardProjectionOptions &
    Readonly<{
      keepAuthoredPython: boolean;
      keepDictionaryEntries: ReadonlySet<string>;
      keepParameterLists: ReadonlySet<string>;
      pendingSectionIds: ReadonlyMap<string, string>;
      unresolvedPendingSectionIds: ReadonlySet<string>;
    }>;

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
  return addPlaygroundSections(
    projectWorkspaceDocumentWithDescriptors(
      snapshot,
      projectSectionDescriptors(snapshot),
    ),
    snapshot.project.id,
  );
}

function projectWorkspaceDocumentWithDescriptors(
  snapshot: ProjectSnapshotV2,
  descriptors: ReadonlyArray<ProjectSectionDescriptor>,
): WorkspaceDocument {
  const descriptorByCanonicalID = descriptorsByCanonicalID(descriptors);
  const sections: WorkspaceDocument["sections"] = {
    [GENERATED_PYTHON_SECTION_ID]: projectGeneratedPythonSection(
      snapshot,
      GENERATED_PYTHON_SECTION_ID,
      GENERATED_PYTHON_SECTION_SIZE,
    ),
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
    savedViews: null,
  };
}

export function applyProjectSnapshotToWorkspace(
  host: WorkspaceHost,
  snapshot: ProjectSnapshotV2,
  options: ProjectSnapshotProjectionOptions,
): void {
  const current = host.getSnapshot();
  const descriptors = projectSectionDescriptors(snapshot);
  const descriptorByCanonicalID = descriptorsByCanonicalID(descriptors);
  const projected = projectWorkspaceDocumentWithDescriptors(
    snapshot,
    descriptors,
  );
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
    sections[descriptor.workspaceId] = projectClipboardSectionPresentation(
      projectCanonicalResponseSection(
        previous,
        next,
        descriptor,
        options,
        snapshot,
      ),
      options.canonicalSectionPresentationOverrides?.get(
        descriptor.canonicalId,
      ),
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
  const rootLayoutZIndexes = frontmostClipboardRootLayoutZIndexes(
    options.canonicalRootLayoutOverrides,
    current,
    projected,
  );
  for (const canonicalId of snapshot.topLevelSectionIds) {
    const descriptor = requireSectionDescriptor(
      descriptorByCanonicalID,
      canonicalId,
    );
    topLevelSections[descriptor.workspaceId] = projectClipboardTopLevelLayout({
      canonicalId,
      current,
      override: options.canonicalRootLayoutOverrides?.get(canonicalId),
      pendingSectionId: options.pendingSectionIds.get(canonicalId),
      projected,
      workspaceId: descriptor.workspaceId,
      zIndex: rootLayoutZIndexes.get(canonicalId),
    });
  }
  retainUnresolvedPendingSections(current, sections, topLevelSections, options);

  commitWorkspaceDocument(
    host,
    addPlaygroundSections(
      {
        ...current,
        sections,
        topLevelSections,
        activeIds:
          options.activeSectionIds === undefined
            ? projectActiveSectionIds(
                current.activeIds,
                sections,
                descriptors,
                options.pendingSectionIds,
              )
            : projectClipboardActiveSectionIds(
                options.activeSectionIds,
                sections,
              ),
      },
      snapshot.project.id,
      current,
    ),
  );
}

export function readGeneratedPythonTarget(host: WorkspaceHost): {
  generated: string;
  prefix: string;
  suffix: string;
} {
  return readGeneratedPythonTargetForSection(host, GENERATED_PYTHON_SECTION_ID);
}

export function setParameterItemExpression(
  host: WorkspaceHost,
  callableId: string,
  parameterId: string,
  authoredExpression: string,
): void {
  const section = host.getSnapshot().sections[callableSectionID(callableId)];
  const item = section?.itemTree?.items[parameterId];
  const control = item?.presentation?.control;
  if (control === undefined || control.kind === "group") {
    return;
  }
  const next = projectParameterControl(
    parameterUIFromWorkspaceControl(control),
    authoredExpression,
  );
  setItemValue(
    host,
    callableSectionID(callableId),
    parameterId,
    workspaceControlValue(next),
  );
}

export function setParameterItemName(
  host: WorkspaceHost,
  callableId: string,
  parameterId: string,
  name: string,
): void {
  setItemLabel(host, callableSectionID(callableId), parameterId, name);
}

export function createCallableParameterItem(): WorkspaceItem {
  const parameterId = `parameter:authored:${crypto.randomUUID()}`;
  return {
    id: parameterWorkspaceItemID(parameterId),
    children: [],
    presentation: projectParameterPresentation({
      expression: "",
      label: "",
      labelEditable: true,
      ui: defaultCodeParameterUI(),
    }),
  };
}

export function readCallableParameterRows(section: WorkspaceSection): Array<{
  data: ParameterItemData;
  id: string;
  ui: ConfigurableParameterUIV2;
}> {
  const itemTree = section.itemTree;
  if (itemTree === undefined) {
    throw new Error("The Python Canvas callable section has no item tree.");
  }
  const root = itemTree.items[itemTree.rootId];
  if (root === undefined) {
    throw new Error("The Python Canvas callable parameter root is missing.");
  }
  const sectionData = readCallableSectionData(section.data);
  return root.children.map((itemId) => {
    const item = itemTree.items[itemId];
    if (item === undefined) {
      throw new Error(`Python Canvas parameter item ${itemId} is missing.`);
    }
    const presentation = item.presentation;
    if (presentation === undefined || presentation.control.kind === "group") {
      throw new Error(
        `Python Canvas parameter item ${itemId} has no value presentation.`,
      );
    }
    const metadata = sectionData.parameterMetadata[itemId] ?? {
      default: null,
      passingStyle: PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2,
      providerOrdinal: null,
      typeAnnotation: null,
    };
    const ui = parameterUIFromWorkspaceControl(presentation.control);
    if (ui.type === "NestedParam") {
      throw new Error(
        `Python Canvas parameter item ${itemId} has a nested UI.`,
      );
    }
    return {
      data: readParameterItemData({
        authoredExpression: pythonExpressionFromWorkspaceControl(
          presentation.control,
        ),
        ...metadata,
        name: presentation.label,
        nameEditable: presentation.labelEditable,
      }),
      id: itemId,
      ui,
    };
  });
}

export function readCallableParameterItems(
  document: WorkspaceDocument,
  callableId: string,
): Array<{
  data: ParameterItemData;
  id: string;
  ui: ConfigurableParameterUIV2;
}> {
  const section = document.sections[callableSectionID(callableId)];
  if (section === undefined) {
    throw new Error(`Python Canvas callable ${callableId} is missing.`);
  }
  return readCallableParameterRows(section).map((item) => ({
    data: item.data,
    id: canonicalParameterID(item.id),
    ui: item.ui,
  }));
}

export function workspaceForestProposal(
  document: WorkspaceDocument,
  snapshot: ProjectSnapshotV2,
): {
  listChildren: Array<{ childSectionIds: string[]; listId: string }>;
  topLevelSectionIds: string[];
} | null {
  return projectWorkspaceForestProposal(
    document,
    snapshot.lists,
    projectSectionDescriptors(snapshot),
    snapshot.topLevelSectionIds,
  );
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
    parameterMetadata: {},
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
  snapshot: ProjectSnapshotV2,
): WorkspaceSection {
  if (previous === undefined) {
    return next;
  }
  const retained = retainLaggingDiagnosticPresentation(
    previous,
    retainSectionPresentation(previous, next),
    snapshot,
    descriptor.kind === "list"
      ? null
      : { id: descriptor.canonicalId, kind: descriptor.kind },
  );
  switch (descriptor.kind) {
    case "callable": {
      const itemTree = projectCallableItemTree(
        previous.itemTree,
        descriptor.callable,
        options,
      );
      return {
        ...retained,
        data: callableDataForItemTree(retained.data, itemTree),
        itemTree,
      };
    }
    case "dictionary": {
      const itemTree = projectDictionaryItemTree(
        previous.itemTree,
        descriptor.dictionary,
        options,
      );
      return {
        ...retained,
        data: dictionaryDataForItemTree(retained.data, itemTree),
        itemTree,
      };
    }
    case "list":
      return retained;
  }
}

function callableDataForItemTree(
  value: unknown,
  itemTree: WorkspaceSectionItemTree,
): CallableSectionData {
  const data = readCallableSectionData(value);
  return {
    ...data,
    parameterDiagnostics: retainKnownItemEntries(
      data.parameterDiagnostics,
      itemTree,
    ),
    parameterMetadata: retainKnownItemEntries(data.parameterMetadata, itemTree),
  };
}

function dictionaryDataForItemTree(
  value: unknown,
  itemTree: WorkspaceSectionItemTree,
): ParameterDictionarySectionData {
  const data = readParameterDictionarySectionData(value);
  return {
    ...data,
    entryDiagnostics: retainKnownItemEntries(data.entryDiagnostics, itemTree),
  };
}

function retainKnownItemEntries<T>(
  entries: Readonly<Record<string, T>>,
  itemTree: WorkspaceSectionItemTree,
): Record<string, T> {
  const retained: Record<string, T> = {};
  for (const [itemId, entry] of Object.entries(entries)) {
    if (itemTree.items[itemId] !== undefined) {
      retained[itemId] = entry;
    }
  }
  return retained;
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

function retainUnresolvedPendingSections(
  current: WorkspaceDocument,
  sections: WorkspaceDocument["sections"],
  topLevelSections: WorkspaceDocument["topLevelSections"],
  options: ProjectSnapshotProjectionOptions,
): void {
  const resolvingPendingSectionIds = new Set(
    options.pendingSectionIds.values(),
  );
  for (const pendingSectionId of options.unresolvedPendingSectionIds) {
    if (resolvingPendingSectionIds.has(pendingSectionId)) {
      continue;
    }
    const section = current.sections[pendingSectionId];
    const layout = current.topLevelSections[pendingSectionId];
    if (
      section === undefined ||
      layout === undefined ||
      !isPendingPythonCanvasSection(section.kind)
    ) {
      continue;
    }
    sections[pendingSectionId] = section;
    topLevelSections[pendingSectionId] = layout;
  }
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
            ? retainedGeneratedCodeData(
                host,
                snapshot,
                GENERATED_PYTHON_SECTION_ID,
              )
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
      presentation: projectParameterPresentation({
        expression: parameter.authoredExpression,
        label: parameter.name,
        labelEditable: parameter.nameEditable,
        ui: parameter.ui,
      }),
    };
  }
  return {
    rootId,
    items,
    selectedItemIds:
      previous?.selectedItemIds.filter((id) => ids.includes(id)) ?? [],
  };
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
  const parameterMetadata: CallableSectionData["parameterMetadata"] = {};
  for (const parameter of callable.parameters) {
    parameterMetadata[parameterWorkspaceItemID(parameter.id)] =
      projectParameterItemMetadata(parameter);
  }
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
    parameterMetadata,
    providerStatus: snapshot.providerStatus,
  };
}

function projectParameterItemMetadata(
  parameter: ParameterV2,
): CallableSectionData["parameterMetadata"][string] {
  return {
    default: parameter.default,
    passingStyle: parameter.passingStyle,
    providerOrdinal: parameter.providerOrdinal,
    typeAnnotation: parameter.typeAnnotation,
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
