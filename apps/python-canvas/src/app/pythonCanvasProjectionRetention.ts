import type { WorkspaceDocument, WorkspaceHost } from "@setta/workspace";

import type {
  DictionaryEntryV2,
  ParameterProposalV2,
  ProjectSnapshotV2,
} from "../api/generatedContract";
import {
  dictionaryEntryDraft,
  parameterListDraft,
  sameCanonicalPythonTarget,
  sameDictionaryEntries,
  sameParameterList,
  sameProposedList,
  type MutationAnswer,
  type RevisionConflictDraft,
} from "./pythonCanvasAppSupport";
import { readGeneratedPythonTarget } from "./workspaceProjection";

type ProjectCallable = ProjectSnapshotV2["callables"][number];
type ProjectDictionary = ProjectSnapshotV2["parameterDictionaries"][number];

function shouldRetainParameterListDraft(
  draft: ParameterProposalV2[],
  callable: ProjectCallable,
  answer: MutationAnswer,
): boolean {
  if (answer.kind === "publication") {
    const previous = answer.previousSnapshot.callables.find(
      (candidate) => candidate.id === callable.id,
    );
    return previous !== undefined && !sameParameterList(draft, previous);
  }
  if (answer.kind === "refresh") {
    return (
      answer.callableId !== callable.id && !sameParameterList(draft, callable)
    );
  }
  if (answer.kind === "python-target") {
    return (
      !answer.refreshedCallableIds.has(callable.id) &&
      !sameParameterList(draft, callable)
    );
  }
  if (answer.kind === "parameters" && answer.callableId === callable.id) {
    return !sameProposedList(answer.sent, draft);
  }
  return !sameParameterList(draft, callable);
}

function shouldRetainPublishedDictionaryDraft(
  draft: DictionaryEntryV2[],
  dictionaryId: string,
  answer: Extract<MutationAnswer, { kind: "publication" }>,
): boolean {
  const previous = answer.previousSnapshot.parameterDictionaries.find(
    (candidate) => candidate.id === dictionaryId,
  );
  return previous !== undefined && !sameDictionaryEntries(draft, previous);
}

function shouldRetainDictionaryDraft(
  draft: DictionaryEntryV2[],
  dictionary: ProjectDictionary,
  answer: MutationAnswer,
): boolean {
  if (answer.kind === "publication") {
    return shouldRetainPublishedDictionaryDraft(draft, dictionary.id, answer);
  }
  if (answer.kind === "dictionary" && answer.dictionaryId === dictionary.id) {
    return !sameDictionaryEntries(answer.sent, { entries: draft });
  }
  return !sameDictionaryEntries(draft, dictionary);
}

export function collectRetainedParameterLists(
  document: WorkspaceDocument,
  nextSnapshot: ProjectSnapshotV2,
  answer: MutationAnswer,
  conflictDraft: RevisionConflictDraft = null,
): Set<string> {
  const retained = new Set<string>();
  for (const callable of nextSnapshot.callables) {
    const draft = parameterListDraft(document, callable.id);
    if (
      draft !== null &&
      shouldRetainParameterListDraft(draft, callable, answer)
    ) {
      retained.add(callable.id);
    }
  }
  if (conflictDraft?.kind === "parameters") {
    retained.add(conflictDraft.callableId);
  }
  return retained;
}

export function collectRetainedDictionaryEntries(
  document: WorkspaceDocument,
  nextSnapshot: ProjectSnapshotV2,
  answer: MutationAnswer,
  conflictDraft: RevisionConflictDraft = null,
): Set<string> {
  const retained = new Set<string>();
  for (const dictionary of nextSnapshot.parameterDictionaries) {
    const draft = dictionaryEntryDraft(document, dictionary.id);
    if (
      draft !== null &&
      shouldRetainDictionaryDraft(draft, dictionary, answer)
    ) {
      retained.add(dictionary.id);
    }
  }
  if (conflictDraft?.kind === "dictionary") {
    retained.add(conflictDraft.dictionaryId);
  }
  return retained;
}

function canonicalPythonSnapshot(
  nextSnapshot: ProjectSnapshotV2,
  answer: MutationAnswer,
): ProjectSnapshotV2 {
  return answer.kind === "publication" ? answer.previousSnapshot : nextSnapshot;
}

export function shouldKeepAuthoredPython(
  host: WorkspaceHost,
  nextSnapshot: ProjectSnapshotV2,
  answer: MutationAnswer,
): boolean {
  try {
    const authored = readGeneratedPythonTarget(host);
    return !sameCanonicalPythonTarget(
      authored,
      canonicalPythonSnapshot(nextSnapshot, answer),
    );
  } catch {
    return false;
  }
}
