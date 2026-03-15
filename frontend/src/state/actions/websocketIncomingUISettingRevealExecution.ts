import { type UISettingRevealContent } from "utils/generatedTypes";

import { getCurrProjectConfigId } from "./sectionEffectiveImplSelectors";
import {
  receiveUISettingReveal,
  type UISettingRevealExecutionContext,
} from "./uiSettingRevealRequests";
import {
  buildExecutionContextMismatchStatuses,
  type UISettingRevealResultStatus,
} from "./uiSettingRevealShared";
import type { FrontendWebsocketMessageContext } from "./websocketIncomingTypes";

export function buildRevealExecutionContext(
  revealContent: UISettingRevealContent,
  context: FrontendWebsocketMessageContext,
): UISettingRevealExecutionContext {
  return {
    requestId: revealContent.requestId,
    requestedProjectConfigId: revealContent.projectConfigId.trim(),
    socketGeneration: context.socketGeneration,
    isSocketGenerationActive: () =>
      context.isSocketGenerationCurrent(context.socketGeneration) &&
      context.isSocketOpen(),
  };
}

export async function executeIncomingUISettingReveal(
  revealContent: UISettingRevealContent,
  executionContext: UISettingRevealExecutionContext,
): Promise<Array<UISettingRevealResultStatus>> {
  let statuses: Array<UISettingRevealResultStatus> = [];
  try {
    const revealStatuses = await receiveUISettingReveal(
      revealContent,
      executionContext,
    );
    statuses = Array.isArray(revealStatuses) ? revealStatuses : [];
  } catch (error) {
    const rawMessage =
      error instanceof Error && error.message.trim() !== ""
        ? error.message
        : String(error);
    const normalizedMessage = `Failed to process UI setting reveal: ${rawMessage}`;
    statuses = revealContent.reveals.map((target) => ({
      settingId: target.settingId,
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage: normalizedMessage,
    }));
  }
  const ackContextMismatchStatuses = resolveAckContextMismatchStatuses({
    content: revealContent,
    executionContext,
  });
  return ackContextMismatchStatuses ?? statuses;
}

function resolveAckContextMismatchStatuses({
  content,
  executionContext,
}: {
  content: UISettingRevealContent;
  executionContext: UISettingRevealExecutionContext;
}): Array<UISettingRevealResultStatus> | null {
  if (!executionContext.isSocketGenerationActive()) {
    return buildExecutionContextMismatchStatuses({
      reveals: content.reveals,
      errorMessage:
        "UI setting reveal execution context mismatch: websocket generation changed " +
        `before request ${executionContext.requestId} completed.`,
    });
  }
  const activeProjectConfigId = getCurrProjectConfigId().trim();
  const requestedProjectConfigId = executionContext.requestedProjectConfigId;
  if (activeProjectConfigId === requestedProjectConfigId) {
    return null;
  }
  return buildExecutionContextMismatchStatuses({
    reveals: content.reveals,
    errorMessage:
      "UI setting reveal execution context mismatch: requested project " +
      `${requestedProjectConfigId} but active project is ${activeProjectConfigId}.`,
  });
}
