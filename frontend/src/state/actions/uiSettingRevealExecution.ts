import type { UISettingRevealTarget } from "utils/generatedTypes";

import { revealWithFallbackAnchor } from "./uiSettingRevealFallbackAnchor";
import {
  applyRevealMutationsWithLease,
  finalizeRevealMutationLease,
  rollbackRevealMutationLease,
} from "./uiSettingRevealMutations";
import { revealWithPluginHandler } from "./uiSettingRevealPluginHandler";
import {
  buildExecutionContextMismatchStatus,
  resolveRevealExecutionMismatch,
  type UISettingRevealExecutionContext,
  type UISettingRevealResultStatus,
} from "./uiSettingRevealShared";

function buildRevealSuccessStatus(
  settingId: string,
): UISettingRevealResultStatus {
  return {
    settingId,
    status: "revealed",
    errorCode: null,
    errorMessage: null,
  };
}

export async function revealSingleSetting({
  target,
  durationMs,
  fallbackProjectConfigId,
  requestedActiveSectionId,
  executionContext,
}: {
  target: UISettingRevealTarget;
  durationMs: number;
  fallbackProjectConfigId: string;
  requestedActiveSectionId: string | null;
  executionContext: UISettingRevealExecutionContext | null;
}): Promise<UISettingRevealResultStatus> {
  const startMismatch = resolveRevealExecutionMismatch(executionContext);
  if (startMismatch !== null) {
    return buildExecutionContextMismatchStatus(
      target.settingId,
      startMismatch.message,
    );
  }

  const mutationResult = await applyRevealMutationsWithLease({
    target,
    fallbackProjectConfigId,
    requestedActiveSectionId,
    executionContext,
  });
  if (!mutationResult.ok) {
    return mutationResult.status;
  }

  const mutationLease = mutationResult.lease;
  let shouldRollbackMutationLease = true;
  try {
    const deadlineMs = Date.now() + durationMs;
    let pluginRevealErrorMessage: string | null = null;
    if (target.strategy === "plugin_handler") {
      const pluginRevealResult = await revealWithPluginHandler(
        target,
        deadlineMs,
        executionContext,
      );
      const postPluginRevealMismatch =
        resolveRevealExecutionMismatch(executionContext);
      if (postPluginRevealMismatch !== null) {
        return buildExecutionContextMismatchStatus(
          target.settingId,
          postPluginRevealMismatch.message,
        );
      }
      if (pluginRevealResult.ok) {
        shouldRollbackMutationLease = false;
        return buildRevealSuccessStatus(target.settingId);
      }
      pluginRevealErrorMessage = pluginRevealResult.errorMessage;
    }

    const fallbackResult = await revealWithFallbackAnchor({
      target,
      durationMs,
      deadlineMs,
      pluginRevealErrorMessage,
      executionContext,
    });
    if (fallbackResult.status === "revealed") {
      shouldRollbackMutationLease = false;
    }
    return fallbackResult;
  } finally {
    try {
      if (shouldRollbackMutationLease) {
        await rollbackRevealMutationLease(mutationLease);
      }
    } finally {
      await finalizeRevealMutationLease(mutationLease);
    }
  }
}
