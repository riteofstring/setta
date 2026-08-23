import type { WorkspaceDocument, WorkspaceHost } from "@setta/workspace";

import { ProjectClientError } from "../backend/client";
import type {
  CallableV2,
  DictionaryEntryV2,
  ListChildrenV2,
  ParameterDictionaryV2,
  ParameterProposalV2,
  ProjectSnapshotV2,
} from "../backend/generatedContract";
import { hasBlockingParameterName } from "../sections/parameterNames";
import {
  callableSectionID,
  listSectionID,
  parameterDictionarySectionID,
  readCallableParameterItems,
  readParameterDictionaryEntries,
  readGeneratedPythonTarget,
  workspaceForestProposal,
} from "./workspaceProjection";

export type MutationAnswer =
  | { callableId: string; kind: "commit" }
  | { callableId: string; kind: "refresh" }
  | { callableId: string; kind: "parameters"; sent: ParameterProposalV2[] }
  | { kind: "python-target"; refreshedCallableIds: ReadonlySet<string> }
  | {
      dictionaryId: string;
      kind: "dictionary";
      sent: DictionaryEntryV2[];
    }
  | { kind: "other" };

export type AppState =
  | { kind: "loading" }
  | { kind: "ready"; host: WorkspaceHost }
  | { kind: "error" };

export type MutationState =
  | { kind: "idle" }
  | {
      description: string;
      kind: "pending";
      parameterAuthoringPending?: boolean;
    }
  | { kind: "error"; message: string };

export type RevisionConflictDraft =
  | {
      callableId: string;
      kind: "parameters";
    }
  | {
      dictionaryId: string;
      kind: "dictionary";
    }
  | null;

export type SectionStructureMutation =
  | { kind: "delete"; sectionId: string; sectionKind: "callable" }
  | { kind: "delete"; sectionId: string; sectionKind: "dictionary" }
  | { kind: "delete"; sectionId: string; sectionKind: "list" }
  | {
      kind: "rename";
      name: string;
      sectionId: string;
      sectionKind: "callable";
    }
  | {
      kind: "rename";
      name: string;
      sectionId: string;
      sectionKind: "dictionary";
    }
  | {
      kind: "rename";
      name: string;
      sectionId: string;
      sectionKind: "list";
    };

type SectionStructureRecord = {
  id: string;
  name: string;
  sectionKind: SectionStructureMutation["sectionKind"];
  workspaceId: string;
};

export type AppController = {
  commitCallable: (callableId: string, value: string) => void;
  commitCallableAndRefreshParameters: (
    callableId: string,
    value: string,
  ) => void;
  deleteCallable: (callableId: string) => void;
  deleteDictionary: (dictionaryId: string) => void;
  deleteList: (listId: string) => void;
  renameCallable: (callableId: string, name: string) => void;
  renameDictionary: (dictionaryId: string, name: string) => void;
  renameList: (listId: string, name: string) => void;
  revertCallableDraft: (callableId: string) => void;
  setCallableDraft: (callableId: string, value: string) => void;
  setParameterExpression: (
    callableId: string,
    parameterId: string,
    value: string,
  ) => void;
  setParameterName: (
    callableId: string,
    parameterId: string,
    name: string,
  ) => void;
  setDictionaryEntryExpression: (
    dictionaryId: string,
    entryId: string,
    value: string,
  ) => void;
  setDictionaryEntryName: (
    dictionaryId: string,
    entryId: string,
    name: string,
  ) => void;
  decrementListChildren: (listId: string, count: number) => void;
  incrementListChildren: (listId: string, count: number) => void;
};

export function isCallableResolutionFailure(error: unknown): boolean {
  return (
    error instanceof ProjectClientError && error.code === "provider_failed"
  );
}

export function callableParameterRefreshRequired(
  previous: CallableV2,
  committedSnapshot: ProjectSnapshotV2,
  forceParameterRefresh: boolean,
): boolean {
  const committed = committedSnapshot.callables.find(
    (candidate) => candidate.id === previous.id,
  );
  return (
    committed !== undefined &&
    committed.authoredExpression !== "" &&
    (forceParameterRefresh ||
      committed.authoredExpression !== previous.authoredExpression)
  );
}

// Section titles and deletion use the package-owned ordinary header. Translate
// those structural changes through the typed server commands, keeping a parent
// deletion singular even when its list subtree disappeared from the document.
export function sectionStructureMutations(
  document: WorkspaceDocument,
  snapshot: ProjectSnapshotV2,
): SectionStructureMutation[] {
  const records = sectionStructureRecords(snapshot);
  const missing = missingSectionIDs(document, records);
  const parentByChild = listParentByChild(snapshot);
  return records.flatMap((record) => {
    const mutation = sectionStructureMutation(
      document,
      record,
      missing,
      parentByChild,
    );
    return mutation === null ? [] : [mutation];
  });
}

function sectionStructureRecords(
  snapshot: ProjectSnapshotV2,
): SectionStructureRecord[] {
  return [
    ...snapshot.callables.map((callable) => ({
      id: callable.id,
      name: callable.name,
      sectionKind: "callable" as const,
      workspaceId: callableSectionID(callable.id),
    })),
    ...snapshot.parameterDictionaries.map((dictionary) => ({
      id: dictionary.id,
      name: dictionary.name,
      sectionKind: "dictionary" as const,
      workspaceId: parameterDictionarySectionID(dictionary.id),
    })),
    ...snapshot.lists.map((list) => ({
      id: list.id,
      name: list.name,
      sectionKind: "list" as const,
      workspaceId: listSectionID(list.id),
    })),
  ];
}

function missingSectionIDs(
  document: WorkspaceDocument,
  records: ReadonlyArray<SectionStructureRecord>,
): ReadonlySet<string> {
  return new Set(
    records
      .filter((record) => document.sections[record.workspaceId] === undefined)
      .map((record) => record.id),
  );
}

function listParentByChild(
  snapshot: ProjectSnapshotV2,
): ReadonlyMap<string, string> {
  const parentByChild = new Map<string, string>();
  for (const list of snapshot.lists) {
    for (const childId of list.childSectionIds) {
      parentByChild.set(childId, list.id);
    }
  }
  return parentByChild;
}

function sectionStructureMutation(
  document: WorkspaceDocument,
  record: SectionStructureRecord,
  missing: ReadonlySet<string>,
  parentByChild: ReadonlyMap<string, string>,
): SectionStructureMutation | null {
  if (missing.has(record.id)) {
    return hasMissingAncestor(record.id, missing, parentByChild)
      ? null
      : {
          kind: "delete",
          sectionId: record.id,
          sectionKind: record.sectionKind,
        };
  }
  const section = document.sections[record.workspaceId];
  return section === undefined || section.name === record.name
    ? null
    : {
        kind: "rename",
        name: section.name,
        sectionId: record.id,
        sectionKind: record.sectionKind,
      };
}

function hasMissingAncestor(
  sectionId: string,
  missing: ReadonlySet<string>,
  parentByChild: ReadonlyMap<string, string>,
): boolean {
  let parent = parentByChild.get(sectionId);
  while (parent !== undefined) {
    if (missing.has(parent)) {
      return true;
    }
    parent = parentByChild.get(parent);
  }
  return false;
}

export function parameterListDraft(
  document: WorkspaceDocument,
  callableId: string,
): ParameterProposalV2[] | null {
  try {
    return documentParameterList(document, callableId);
  } catch {
    return null;
  }
}

function proposedParameterList(
  document: WorkspaceDocument,
  callableId: string,
): ParameterProposalV2[] | null {
  let items: ReturnType<typeof readCallableParameterItems>;
  try {
    items = readCallableParameterItems(document, callableId);
  } catch {
    return null;
  }
  if (hasBlockingParameterName(items)) {
    return null;
  }
  return items.map((item) => ({
    authoredExpression: item.data.authoredExpression,
    id: item.id,
    name: item.data.name,
    ui: item.ui,
  }));
}

export function parameterMutationProposal(
  document: WorkspaceDocument,
  snapshot: ProjectSnapshotV2,
  callableId: string,
): ParameterProposalV2[] | null {
  const callable = snapshot.callables.find(
    (candidate) => candidate.id === callableId,
  );
  if (callable === undefined) {
    return null;
  }
  const proposal = proposedParameterList(document, callableId);
  if (proposal === null || sameParameterList(proposal, callable)) {
    return null;
  }
  return proposal;
}

export function changedParameterCallableIds(
  document: WorkspaceDocument,
  snapshot: ProjectSnapshotV2,
): string[] {
  const changed: string[] = [];
  for (const callable of snapshot.callables) {
    const proposal = proposedParameterList(document, callable.id);
    if (proposal !== null && !sameParameterList(proposal, callable)) {
      changed.push(callable.id);
    }
  }
  return changed;
}

export function changedCanonicalParameterCallableIds(
  previous: ProjectSnapshotV2,
  next: ProjectSnapshotV2,
): ReadonlySet<string> {
  const previousById = new Map(
    previous.callables.map((callable) => [callable.id, callable]),
  );
  return new Set(
    next.callables.flatMap((callable) => {
      const prior = previousById.get(callable.id);
      return prior !== undefined &&
        sameParameterList(prior.parameters, callable)
        ? []
        : [callable.id];
    }),
  );
}

export function dictionaryEntryDraft(
  document: WorkspaceDocument,
  dictionaryId: string,
): DictionaryEntryV2[] | null {
  try {
    return readParameterDictionaryEntries(document, dictionaryId);
  } catch {
    return null;
  }
}

export function dictionaryEntryMutationProposal(
  document: WorkspaceDocument,
  snapshot: ProjectSnapshotV2,
  dictionaryId: string,
): DictionaryEntryV2[] | null {
  const dictionary = snapshot.parameterDictionaries.find(
    (candidate) => candidate.id === dictionaryId,
  );
  const proposal = dictionaryEntryDraft(document, dictionaryId);
  if (
    dictionary === undefined ||
    proposal === null ||
    !validDictionaryEntries(proposal) ||
    sameDictionaryEntries(proposal, dictionary)
  ) {
    return null;
  }
  return proposal;
}

export function changedDictionaryIds(
  document: WorkspaceDocument,
  snapshot: ProjectSnapshotV2,
): string[] {
  return snapshot.parameterDictionaries.flatMap((dictionary) =>
    dictionaryEntryMutationProposal(document, snapshot, dictionary.id) === null
      ? []
      : [dictionary.id],
  );
}

export function forestMutationProposal(
  document: WorkspaceDocument,
  snapshot: ProjectSnapshotV2,
): {
  listChildren: ListChildrenV2[];
  topLevelSectionIds: string[];
} | null {
  const proposal = workspaceForestProposal(document, snapshot);
  if (proposal === null || sameSectionForest(proposal, snapshot)) {
    return null;
  }
  return proposal;
}

export function hasPythonTargetChange(
  host: WorkspaceHost,
  snapshot: ProjectSnapshotV2,
): boolean {
  try {
    return !sameCanonicalPythonTarget(
      readGeneratedPythonTarget(host),
      snapshot,
    );
  } catch {
    return true;
  }
}

export function sameProposedList(
  left: ReadonlyArray<ParameterProposalV2>,
  right: ReadonlyArray<ParameterProposalV2>,
): boolean {
  return (
    left.length === right.length &&
    left.every((parameter, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        other.id === parameter.id &&
        other.name === parameter.name &&
        other.authoredExpression === parameter.authoredExpression &&
        sameParameterUI(other.ui, parameter.ui)
      );
    })
  );
}

export function sameParameterList(
  proposal: ReadonlyArray<ParameterProposalV2>,
  callable: CallableV2,
): boolean {
  return (
    proposal.length === callable.parameters.length &&
    proposal.every((parameter, index) => {
      const canonical = callable.parameters[index];
      return (
        canonical !== undefined &&
        canonical.id === parameter.id &&
        canonical.name === parameter.name &&
        canonical.authoredExpression === parameter.authoredExpression &&
        sameParameterUI(canonical.ui, parameter.ui)
      );
    })
  );
}

export function sameDictionaryEntries(
  proposal: ReadonlyArray<DictionaryEntryV2>,
  dictionary: Pick<ParameterDictionaryV2, "entries">,
): boolean {
  return sameDictionaryEntryLists(proposal, dictionary.entries);
}

function sameDictionaryEntryLists(
  left: ReadonlyArray<DictionaryEntryV2>,
  right: ReadonlyArray<DictionaryEntryV2>,
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index];
      if (
        other === undefined ||
        entry.id !== other.id ||
        entry.kind !== other.kind ||
        entry.name !== other.name
      ) {
        return false;
      }
      if (entry.kind === "leaf" && other.kind === "leaf") {
        return (
          entry.authoredExpression === other.authoredExpression &&
          sameParameterUI(entry.ui, other.ui)
        );
      }
      if (entry.kind === "parent" && other.kind === "parent") {
        return (
          sameParameterUI(entry.ui, other.ui) &&
          sameDictionaryEntryLists(entry.children, other.children)
        );
      }
      return false;
    })
  );
}

function validDictionaryEntries(
  entries: ReadonlyArray<DictionaryEntryV2>,
): boolean {
  const names = new Set<string>();
  for (const entry of entries) {
    const normalized = entry.name.trim();
    if (
      normalized === "" ||
      normalized !== entry.name ||
      names.has(normalized)
    ) {
      return false;
    }
    names.add(normalized);
    if (entry.kind === "parent" && !validDictionaryEntries(entry.children)) {
      return false;
    }
  }
  return true;
}

function sameSectionForest(
  proposal: {
    listChildren: ReadonlyArray<ListChildrenV2>;
    topLevelSectionIds: ReadonlyArray<string>;
  },
  snapshot: ProjectSnapshotV2,
): boolean {
  if (
    !sameStringList(proposal.topLevelSectionIds, snapshot.topLevelSectionIds)
  ) {
    return false;
  }
  if (proposal.listChildren.length !== snapshot.lists.length) {
    return false;
  }
  const childrenByList = new Map(
    proposal.listChildren.map((list) => [list.listId, list.childSectionIds]),
  );
  return snapshot.lists.every((list) =>
    sameStringList(childrenByList.get(list.id) ?? [], list.childSectionIds),
  );
}

function sameStringList(
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function sameCanonicalPythonTarget(
  authored: { prefix: string; suffix: string },
  snapshot: ProjectSnapshotV2,
): boolean {
  return (
    authored.prefix === snapshot.pythonTarget.prefix &&
    authored.suffix === snapshot.pythonTarget.suffix
  );
}

export function mutationErrorMessage(target: string, error: unknown): string {
  if (error instanceof ProjectClientError) {
    return `Unable to update ${target}. ${error.message}`;
  }
  return `Unable to update ${target}. Try again.`;
}

function documentParameterList(
  document: WorkspaceDocument,
  callableId: string,
): ParameterProposalV2[] {
  return readCallableParameterItems(document, callableId).map((item) => ({
    authoredExpression: item.data.authoredExpression,
    id: item.id,
    name: item.data.name,
    ui: item.ui,
  }));
}

function sameParameterUI(left: { type: string; configuration: unknown }, right: { type: string; configuration: unknown }): boolean {
  return (
    left.type === right.type &&
    JSON.stringify(left.configuration) === JSON.stringify(right.configuration)
  );
}
