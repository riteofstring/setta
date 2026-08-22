import type { WorkspaceDocument, WorkspaceHost } from "@setta/workspace";

import { ProjectClientError } from "../backend/client";
import type {
  CallableV2,
  ParameterProposalV2,
  ProjectSnapshotV2,
} from "../backend/generatedContract";
import { hasBlockingParameterName } from "../sections/parameterNames";
import {
  isCallableParameterAuthoringPending,
  readCallableParameterItems,
  readGeneratedPythonTarget,
} from "./workspaceProjection";

export type MutationAnswer =
  | { callableId: string; kind: "commit" }
  | { callableId: string; kind: "parameters"; sent: ParameterProposalV2[] }
  | { kind: "other" };

export type RevisionConflictDraft =
  | { callableId: string; kind: "callable-rename"; name: string }
  | { callableId: string; kind: "parameters" }
  | { kind: "project-rename"; name: string }
  | null;

export type AppController = {
  commitCallable: (callableId: string, value: string) => void;
  createCallable: (name: string) => void;
  deleteCallable: (callableId: string) => void;
  renameCallable: (callableId: string, name: string) => void;
  renameProject: (name: string) => void;
  revertCallableDraft: (callableId: string) => void;
  setCallableDraft: (callableId: string, value: string) => void;
  setCallableNameDraft: (callableId: string, name: string) => void;
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
  if (isCallableParameterAuthoringPending(document, callableId)) {
    return null;
  }
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
    if (isCallableParameterAuthoringPending(document, callable.id)) {
      continue;
    }
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
