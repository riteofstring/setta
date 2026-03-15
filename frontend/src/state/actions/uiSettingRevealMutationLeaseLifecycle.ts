import { runWithRevealMutationLock } from "./uiSettingRevealMutationLock";
import { clearRevealMutationOwnershipForLease } from "./uiSettingRevealMutationOwnership";
import { rollbackRevealMutationSnapshotsForLease } from "./uiSettingRevealMutationRestore";
import type { RevealMutationLease } from "./uiSettingRevealMutationTypes";

export async function rollbackRevealMutationLease(
  mutationLease: RevealMutationLease,
): Promise<void> {
  await runWithRevealMutationLock(() => {
    rollbackRevealMutationSnapshotsForLease(mutationLease);
  });
}

export async function finalizeRevealMutationLease(
  mutationLease: RevealMutationLease,
): Promise<void> {
  await runWithRevealMutationLock(() => {
    clearRevealMutationOwnershipForLease(mutationLease);
  });
}
