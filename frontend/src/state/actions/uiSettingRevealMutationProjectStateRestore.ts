import { getActiveSectionUIIds } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import { restoreBackendAuthoritativeActiveSectionIds } from "./activeSections";
import { areStringArraysEqual } from "./uiSettingRevealActivationShared";
import {
  isRevealMutationOwnerMatch,
  revealMutationOwners,
} from "./uiSettingRevealMutationOwnership";
import type {
  RevealMutationDiff,
  RevealProjectStateSnapshot,
} from "./uiSettingRevealMutationTypes";

export function restoreRevealProjectStateSnapshotIfOwned({
  snapshot,
  postMutationSnapshot,
  mutationDiff,
  leaseId,
}: {
  snapshot: RevealProjectStateSnapshot;
  postMutationSnapshot: RevealProjectStateSnapshot;
  mutationDiff: RevealMutationDiff;
  leaseId?: number;
}): void {
  const projectConfigId = useProjectState.getState().projectConfig.id;
  if (
    !mutationDiff.touchedProjectStateActiveIdsProjectConfigIds.has(
      projectConfigId,
    )
  ) {
    return;
  }
  if (
    !isRevealMutationOwnerMatch(
      revealMutationOwners.projectStateActiveIdsProjectConfigId.get(
        projectConfigId,
      ),
      leaseId,
    )
  ) {
    return;
  }
  if (projectConfigId !== postMutationSnapshot.projectConfigId) {
    return;
  }
  if (
    !areStringArraysEqual(
      getActiveSectionUIIds(),
      postMutationSnapshot.activeIds,
    )
  ) {
    return;
  }
  restoreBackendAuthoritativeActiveSectionIds(snapshot.activeIds);
}
