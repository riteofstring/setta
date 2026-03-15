import type {
  RevealLocalStorageSnapshot,
  RevealMutationDiff,
  RevealMutationLease,
  RevealProjectStateSnapshot,
} from "./uiSettingRevealMutationTypes";

type RevealMutationOwners = {
  overviewVis: number | null;
  overviewTab: number | null;
  watchCodePortalOpen: number | null;
  uiEditorVis: number | null;
  uiEditorTabSectionType: Map<string, number>;
  projectChatAuxViewProjectConfigId: Map<string, number>;
  runInstructionsProjectConfigId: Map<string, number>;
  projectAiProjectConfigId: Map<string, number>;
  projectStateActiveIdsProjectConfigId: Map<string, number>;
};

export const revealMutationOwners: RevealMutationOwners = {
  overviewVis: null,
  overviewTab: null,
  watchCodePortalOpen: null,
  uiEditorVis: null,
  uiEditorTabSectionType: new Map<string, number>(),
  projectChatAuxViewProjectConfigId: new Map<string, number>(),
  runInstructionsProjectConfigId: new Map<string, number>(),
  projectAiProjectConfigId: new Map<string, number>(),
  projectStateActiveIdsProjectConfigId: new Map<string, number>(),
};

let revealMutationSequence = 0;

export function registerRevealMutationLease(
  localStorageSnapshot: RevealLocalStorageSnapshot,
  postMutationLocalStorageSnapshot: RevealLocalStorageSnapshot,
  projectStateSnapshot: RevealProjectStateSnapshot,
  postMutationProjectStateSnapshot: RevealProjectStateSnapshot,
  mutationDiff: RevealMutationDiff,
): RevealMutationLease {
  revealMutationSequence += 1;
  const lease = {
    leaseId: revealMutationSequence,
    localStorageSnapshot,
    postMutationLocalStorageSnapshot,
    projectStateSnapshot,
    postMutationProjectStateSnapshot,
    mutationDiff,
  };
  recordRevealMutationOwnership(lease);
  return lease;
}

export function clearRevealMutationOwnershipForLease({
  leaseId,
  mutationDiff,
}: RevealMutationLease): void {
  if (
    mutationDiff.touchedOverviewVis &&
    revealMutationOwners.overviewVis === leaseId
  ) {
    revealMutationOwners.overviewVis = null;
  }
  if (
    mutationDiff.touchedOverviewTab &&
    revealMutationOwners.overviewTab === leaseId
  ) {
    revealMutationOwners.overviewTab = null;
  }
  if (
    mutationDiff.touchedWatchCodePortalOpen &&
    revealMutationOwners.watchCodePortalOpen === leaseId
  ) {
    revealMutationOwners.watchCodePortalOpen = null;
  }
  if (
    mutationDiff.touchedUiEditorVis &&
    revealMutationOwners.uiEditorVis === leaseId
  ) {
    revealMutationOwners.uiEditorVis = null;
  }
  for (const sectionType of mutationDiff.touchedUiEditorTabSectionTypes) {
    if (
      revealMutationOwners.uiEditorTabSectionType.get(sectionType) !== leaseId
    ) {
      continue;
    }
    revealMutationOwners.uiEditorTabSectionType.delete(sectionType);
  }
  for (const projectConfigId of mutationDiff.touchedProjectChatAuxViewProjectConfigIds) {
    if (
      revealMutationOwners.projectChatAuxViewProjectConfigId.get(
        projectConfigId,
      ) !== leaseId
    ) {
      continue;
    }
    revealMutationOwners.projectChatAuxViewProjectConfigId.delete(
      projectConfigId,
    );
  }
  for (const projectConfigId of mutationDiff.touchedRunInstructionsProjectConfigIds) {
    if (
      revealMutationOwners.runInstructionsProjectConfigId.get(
        projectConfigId,
      ) !== leaseId
    ) {
      continue;
    }
    revealMutationOwners.runInstructionsProjectConfigId.delete(projectConfigId);
  }
  for (const projectConfigId of mutationDiff.touchedProjectAiProjectConfigIds) {
    if (
      revealMutationOwners.projectAiProjectConfigId.get(projectConfigId) !==
      leaseId
    ) {
      continue;
    }
    revealMutationOwners.projectAiProjectConfigId.delete(projectConfigId);
  }
  for (const projectConfigId of mutationDiff.touchedProjectStateActiveIdsProjectConfigIds) {
    if (
      revealMutationOwners.projectStateActiveIdsProjectConfigId.get(
        projectConfigId,
      ) !== leaseId
    ) {
      continue;
    }
    revealMutationOwners.projectStateActiveIdsProjectConfigId.delete(
      projectConfigId,
    );
  }
}

export function isRevealMutationOwnerMatch(
  ownerLeaseId: number | undefined | null,
  leaseId: number | undefined,
): boolean {
  if (leaseId === undefined) {
    return true;
  }
  return ownerLeaseId === leaseId;
}

function recordRevealMutationOwnership({
  leaseId,
  mutationDiff,
}: RevealMutationLease): void {
  if (mutationDiff.touchedOverviewVis) {
    revealMutationOwners.overviewVis = leaseId;
  }
  if (mutationDiff.touchedOverviewTab) {
    revealMutationOwners.overviewTab = leaseId;
  }
  if (mutationDiff.touchedWatchCodePortalOpen) {
    revealMutationOwners.watchCodePortalOpen = leaseId;
  }
  if (mutationDiff.touchedUiEditorVis) {
    revealMutationOwners.uiEditorVis = leaseId;
  }
  for (const sectionType of mutationDiff.touchedUiEditorTabSectionTypes) {
    revealMutationOwners.uiEditorTabSectionType.set(sectionType, leaseId);
  }
  for (const projectConfigId of mutationDiff.touchedProjectChatAuxViewProjectConfigIds) {
    revealMutationOwners.projectChatAuxViewProjectConfigId.set(
      projectConfigId,
      leaseId,
    );
  }
  for (const projectConfigId of mutationDiff.touchedRunInstructionsProjectConfigIds) {
    revealMutationOwners.runInstructionsProjectConfigId.set(
      projectConfigId,
      leaseId,
    );
  }
  for (const projectConfigId of mutationDiff.touchedProjectAiProjectConfigIds) {
    revealMutationOwners.projectAiProjectConfigId.set(projectConfigId, leaseId);
  }
  for (const projectConfigId of mutationDiff.touchedProjectStateActiveIdsProjectConfigIds) {
    revealMutationOwners.projectStateActiveIdsProjectConfigId.set(
      projectConfigId,
      leaseId,
    );
  }
}
