import type { WorkspaceDocument, WorkspaceHost } from "@setta/workspace";

import { ProjectClientError } from "../backend/client";
import type {
  CallableV2,
  ParameterProposalV2,
  ProjectSnapshotV2,
} from "../backend/generatedContract";
import { hasBlockingParameterName } from "../sections/parameterNames";
import {
  callableSectionID,
  readCallableParameterItems,
  readGeneratedPythonTarget,
} from "./workspaceProjection";

export type MutationAnswer =
  | { callableId: string; kind: "commit" }
  | { callableId: string; kind: "refresh" }
  | { callableId: string; kind: "parameters"; sent: ParameterProposalV2[] }
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

export type RevisionConflictDraft = {
  callableId: string;
  kind: "parameters";
} | null;

type CallableStructureMutation =
  | { callableId: string; kind: "delete" }
  | { callableId: string; kind: "rename"; name: string };

export type AppController = {
  commitCallable: (callableId: string, value: string) => void;
  commitCallableAndRefreshParameters: (
    callableId: string,
    value: string,
  ) => void;
  deleteCallable: (callableId: string) => void;
  renameCallable: (callableId: string, name: string) => void;
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

// Callable sections use the workspace's main-derived header controls. Translate
// the two structural edits those controls can make back into the server-owned
// callable aggregate instead of rendering a second set of app-specific forms.
export function callableStructureMutations(
  document: WorkspaceDocument,
  snapshot: ProjectSnapshotV2,
): CallableStructureMutation[] {
  const mutations: CallableStructureMutation[] = [];
  for (const callable of snapshot.callables) {
    const section = document.sections[callableSectionID(callable.id)];
    if (section === undefined) {
      mutations.push({ callableId: callable.id, kind: "delete" });
    } else if (section.name !== callable.name) {
      mutations.push({
        callableId: callable.id,
        kind: "rename",
        name: section.name,
      });
    }
  }
  return mutations;
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
        other.authoredExpression === parameter.authoredExpression
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
        canonical.authoredExpression === parameter.authoredExpression
      );
    })
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
  }));
}
