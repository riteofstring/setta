import type { UISettingRevealTarget } from "utils/generatedTypes";
import {
  buildRevealMutationFailureResult,
  captureRevealLocalStorageSnapshot,
  captureRevealProjectStateSnapshot,
  createEmptyRevealMutationDiff,
} from "./uiSettingRevealMutationCapture";
import { runWithRevealMutationLock } from "./uiSettingRevealMutationLock";
import { registerRevealMutationLease } from "./uiSettingRevealMutationOwnership";
import type {
  RevealMutationDiff,
  RevealMutationResult,
} from "./uiSettingRevealMutationTypes";
import {
  applyRequestedActiveSectionForReveal,
  openPaneForRevealTarget,
} from "./uiSettingRevealPaneActivation";
import {
  buildExecutionContextMismatchStatus,
  resolveRevealExecutionMismatch,
  type UISettingRevealExecutionContext,
  type UISettingRevealResultStatus,
} from "./uiSettingRevealShared";
import { applyRevealActivationSteps } from "./uiSettingRevealStepActivation";

type RevealMutationFailureContext = {
  localStorageSnapshot: ReturnType<typeof captureRevealLocalStorageSnapshot>;
  projectStateSnapshot: ReturnType<typeof captureRevealProjectStateSnapshot>;
  mutationDiff: RevealMutationDiff;
};

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

    const mutationContext = createRevealMutationFailureContext();
    const requestedSectionActivationResult =
      applyRequestedActiveSectionForReveal({
        requestedActiveSectionId,
        fallbackProjectConfigId,
        mutationDiff: mutationContext.mutationDiff,
      });
    if (!requestedSectionActivationResult.ok) {
      return buildRevealMutationFailureStatus(
        {
          settingId: target.settingId,
          status: "failed",
          errorCode: "mutation_failed",
          errorMessage: requestedSectionActivationResult.errorMessage,
        },
        mutationContext,
      );
    }

    const opened = openPaneForRevealTarget(
      target,
      mutationContext.mutationDiff,
    );
    if (!opened.ok) {
      return buildRevealMutationFailureStatus(
        {
          settingId: target.settingId,
          status: "failed",
          errorCode: "mutation_failed",
          errorMessage: opened.errorMessage,
        },
        mutationContext,
      );
    }

    const postPaneMismatch = resolveRevealExecutionMismatch(executionContext);
    if (postPaneMismatch !== null) {
      return buildRevealMutationFailureStatus(
        buildExecutionContextMismatchStatus(
          target.settingId,
          postPaneMismatch.message,
        ),
        mutationContext,
      );
    }

    applyRevealActivationSteps({
      target,
      fallbackProjectConfigId,
      mutationDiff: mutationContext.mutationDiff,
    });
    const postActivationMismatch =
      resolveRevealExecutionMismatch(executionContext);
    if (postActivationMismatch !== null) {
      return buildRevealMutationFailureStatus(
        buildExecutionContextMismatchStatus(
          target.settingId,
          postActivationMismatch.message,
        ),
        mutationContext,
      );
    }

    const postMutationLocalStorageSnapshot =
      captureRevealLocalStorageSnapshot();
    const postMutationProjectStateSnapshot =
      captureRevealProjectStateSnapshot();
    return {
      ok: true,
      lease: registerRevealMutationLease(
        mutationContext.localStorageSnapshot,
        postMutationLocalStorageSnapshot,
        mutationContext.projectStateSnapshot,
        postMutationProjectStateSnapshot,
        mutationContext.mutationDiff,
      ),
    };
  });
}

function createRevealMutationFailureContext(): RevealMutationFailureContext {
  return {
    localStorageSnapshot: captureRevealLocalStorageSnapshot(),
    projectStateSnapshot: captureRevealProjectStateSnapshot(),
    mutationDiff: createEmptyRevealMutationDiff(),
  };
}

function buildRevealMutationFailureStatus(
  status: UISettingRevealResultStatus,
  mutationContext: RevealMutationFailureContext,
): RevealMutationResult {
  return buildRevealMutationFailureResult(status, mutationContext);
}
