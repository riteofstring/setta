import type { UISettingRevealTarget } from "utils/generatedTypes";
import {
  applyRequestedActiveSectionForReveal,
  applyRevealActivationSteps,
  openPaneForRevealTarget,
} from "./uiSettingRevealActivation";
import {
  clearRevealMutationOwnershipForLease,
  registerRevealMutationLease,
} from "./uiSettingRevealMutationOwnership";
import {
  buildRevealMutationFailureResult,
  captureRevealLocalStorageSnapshot,
  captureRevealProjectStateSnapshot,
  createEmptyRevealMutationDiff,
  rollbackRevealMutationSnapshotsForLease,
} from "./uiSettingRevealMutationSnapshots";
import type {
  RevealMutationLease,
  RevealMutationResult,
} from "./uiSettingRevealMutationTypes";
import {
  buildExecutionContextMismatchStatus,
  resolveRevealExecutionMismatch,
  type UISettingRevealExecutionContext,
} from "./uiSettingRevealShared";

export type {
  RevealMutationDiff,
  RevealMutationLease,
  RevealMutationResult,
} from "./uiSettingRevealMutationTypes";

let revealMutationLock: Promise<void> = Promise.resolve();

export async function applyRevealMutationsWithLease({
  target,
  fallbackProjectConfigId,
  requestedActiveSectionId,
  executionContext,
}: {
  target: UISettingRevealTarget;
  fallbackProjectConfigId: string;
  requestedActiveSectionId: string | null;
  executionContext: UISettingRevealExecutionContext | null;
}): Promise<RevealMutationResult> {
  return runWithRevealMutationLock(async () => {
    const startMismatch = resolveRevealExecutionMismatch(executionContext);
    if (startMismatch !== null) {
      return {
        ok: false,
        status: buildExecutionContextMismatchStatus(
          target.settingId,
          startMismatch.message,
        ),
      };
    }

    const localStorageSnapshot = captureRevealLocalStorageSnapshot();
    const projectStateSnapshot = captureRevealProjectStateSnapshot();
    const mutationDiff = createEmptyRevealMutationDiff();

    const requestedSectionActivationResult =
      applyRequestedActiveSectionForReveal({
        requestedActiveSectionId,
        fallbackProjectConfigId,
        mutationDiff,
      });
    if (!requestedSectionActivationResult.ok) {
      return buildRevealMutationFailureResult(
        {
          settingId: target.settingId,
          status: "failed",
          errorCode: "mutation_failed",
          errorMessage: requestedSectionActivationResult.errorMessage,
        },
        {
          localStorageSnapshot,
          projectStateSnapshot,
          mutationDiff,
        },
      );
    }

    const opened = openPaneForRevealTarget(target, mutationDiff);
    if (!opened.ok) {
      return buildRevealMutationFailureResult(
        {
          settingId: target.settingId,
          status: "failed",
          errorCode: "mutation_failed",
          errorMessage: opened.errorMessage,
        },
        {
          localStorageSnapshot,
          projectStateSnapshot,
          mutationDiff,
        },
      );
    }

    const postPaneMismatch = resolveRevealExecutionMismatch(executionContext);
    if (postPaneMismatch !== null) {
      return buildRevealMutationFailureResult(
        buildExecutionContextMismatchStatus(
          target.settingId,
          postPaneMismatch.message,
        ),
        {
          localStorageSnapshot,
          projectStateSnapshot,
          mutationDiff,
        },
      );
    }

    applyRevealActivationSteps({
      target,
      fallbackProjectConfigId,
      mutationDiff,
    });
    const postActivationMismatch =
      resolveRevealExecutionMismatch(executionContext);
    if (postActivationMismatch !== null) {
      return buildRevealMutationFailureResult(
        buildExecutionContextMismatchStatus(
          target.settingId,
          postActivationMismatch.message,
        ),
        {
          localStorageSnapshot,
          projectStateSnapshot,
          mutationDiff,
        },
      );
    }

    const postMutationLocalStorageSnapshot =
      captureRevealLocalStorageSnapshot();
    const postMutationProjectStateSnapshot =
      captureRevealProjectStateSnapshot();
    return {
      ok: true,
      lease: registerRevealMutationLease(
        localStorageSnapshot,
        postMutationLocalStorageSnapshot,
        projectStateSnapshot,
        postMutationProjectStateSnapshot,
        mutationDiff,
      ),
    };
  });
}

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

async function runWithRevealMutationLock<T>(
  operation: () => Promise<T> | T,
): Promise<T> {
  const previousLock = revealMutationLock;
  let releaseCurrentLock: (() => void) | null = null;
  revealMutationLock = new Promise<void>((resolve) => {
    releaseCurrentLock = resolve;
  });
  await previousLock;
  try {
    return await operation();
  } finally {
    if (releaseCurrentLock !== null) {
      releaseCurrentLock();
    }
  }
}
