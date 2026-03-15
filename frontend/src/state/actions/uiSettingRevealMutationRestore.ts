import { restoreRevealLocalStorageSnapshotIfOwned } from "./uiSettingRevealMutationLocalStorageRestore";
import { restoreRevealProjectStateSnapshotIfOwned } from "./uiSettingRevealMutationProjectStateRestore";
import type {
  RevealLocalStorageSnapshot,
  RevealMutationDiff,
  RevealMutationLease,
  RevealProjectStateSnapshot,
} from "./uiSettingRevealMutationTypes";

export function restoreRevealMutationSnapshotsIfOwned({
  localStorageSnapshot,
  postMutationLocalStorageSnapshot,
  projectStateSnapshot,
  postMutationProjectStateSnapshot,
  mutationDiff,
  leaseId,
}: {
  localStorageSnapshot: RevealLocalStorageSnapshot;
  postMutationLocalStorageSnapshot: RevealLocalStorageSnapshot;
  projectStateSnapshot: RevealProjectStateSnapshot;
  postMutationProjectStateSnapshot: RevealProjectStateSnapshot;
  mutationDiff: RevealMutationDiff;
  leaseId?: number;
}): void {
  restoreRevealLocalStorageSnapshotIfOwned({
    snapshot: localStorageSnapshot,
    postMutationSnapshot: postMutationLocalStorageSnapshot,
    mutationDiff,
    leaseId,
  });
  restoreRevealProjectStateSnapshotIfOwned({
    snapshot: projectStateSnapshot,
    postMutationSnapshot: postMutationProjectStateSnapshot,
    mutationDiff,
    leaseId,
  });
}

export function rollbackRevealMutationSnapshotsForLease(
  mutationLease: RevealMutationLease,
): void {
  restoreRevealMutationSnapshotsIfOwned(mutationLease);
}
