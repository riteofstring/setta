import type { UISettingRevealTarget } from "utils/generatedTypes";

import {
  applyRevealHighlight,
  scrollRevealAnchorIntoView,
  waitForRevealAnchorElement,
} from "./uiSettingRevealDom";
import {
  buildExecutionContextMismatchStatus,
  resolveRevealExecutionMismatch,
  type UISettingRevealExecutionContext,
  type UISettingRevealResultStatus,
} from "./uiSettingRevealShared";

export async function revealWithFallbackAnchor({
  target,
  durationMs,
  deadlineMs,
  pluginRevealErrorMessage,
  executionContext,
}: {
  target: UISettingRevealTarget;
  durationMs: number;
  deadlineMs: number;
  pluginRevealErrorMessage: string | null;
  executionContext: UISettingRevealExecutionContext | null;
}): Promise<UISettingRevealResultStatus> {
  if (target.anchorId === null || target.anchorId === undefined) {
    return {
      settingId: target.settingId,
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage: pluginRevealErrorMessage
        ? `${pluginRevealErrorMessage} No fallback anchorId is available.`
        : `Setting ${target.settingId} is missing a reveal anchorId.`,
    };
  }

  const remainingMsForAnchor = deadlineMs - Date.now();
  if (remainingMsForAnchor <= 0) {
    return {
      settingId: target.settingId,
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage: pluginRevealErrorMessage
        ? `${pluginRevealErrorMessage} Reveal deadline exceeded before fallback anchor lookup.`
        : `Reveal deadline exceeded before locating anchor for ${target.settingId}.`,
    };
  }

  const anchorElement = await waitForRevealAnchorElement({
    side: target.side,
    anchorId: target.anchorId,
    deadlineMs,
    executionContext,
  });
  const postAnchorLookupMismatch =
    resolveRevealExecutionMismatch(executionContext);
  if (postAnchorLookupMismatch !== null) {
    return buildExecutionContextMismatchStatus(
      target.settingId,
      postAnchorLookupMismatch.message,
    );
  }
  if (!anchorElement) {
    return {
      settingId: target.settingId,
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage: pluginRevealErrorMessage
        ? `${pluginRevealErrorMessage} Fallback anchor was not found.`
        : `Could not find anchor ${target.anchorId} for ${target.settingId}.`,
    };
  }

  scrollRevealAnchorIntoView(anchorElement);
  applyRevealHighlight(anchorElement, durationMs);
  return {
    settingId: target.settingId,
    status: "revealed",
    errorCode: null,
    errorMessage: null,
  };
}
